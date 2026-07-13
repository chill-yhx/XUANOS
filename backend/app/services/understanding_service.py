from datetime import UTC, datetime

from fastapi import status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import APIError
from app.core.idempotency import IdempotencyManager
from app.db.base import new_id
from app.models.goal import Constraint, Goal
from app.models.hypothesis import Hypothesis
from app.models.understanding import Answer, UnderstandingSession, UserCorrection
from app.repositories.workflow import WorkflowRepository
from app.rules.hypothesis_lifecycle import (
    EXECUTION_AVOIDANCE_CATEGORY,
    EXECUTION_AVOIDANCE_CONTENT,
    hypothesis_semantic_key,
    is_active_hypothesis,
)
from app.rules.understanding_mock import QUESTION_MAP, QUESTIONS, generate_understanding
from app.schemas.snapshot import SnapshotRead
from app.schemas.understanding import (
    AnswerRead,
    CorrectionRead,
    QuestionRead,
    UnderstandingAnalyzeRequest,
    UnderstandingAnalyzeResult,
    UnderstandingConfirmRequest,
    UnderstandingConfirmResult,
    UnderstandingSessionRead,
    UnderstandingSummaryRead,
)
from app.services.snapshot_service import SnapshotService


class UnderstandingService:
    def __init__(self, session: Session, user_id: str) -> None:
        self.session = session
        self.user_id = user_id
        self.workflow = WorkflowRepository(session)

    def analyze(self, payload: UnderstandingAnalyzeRequest, idempotency_key: str) -> dict:
        manager = IdempotencyManager(
            self.session,
            self.user_id,
            "POST /api/understanding/analyze",
            idempotency_key,
            payload.model_dump(mode="json"),
        )
        if replay := manager.replay():
            return replay

        thread = self._thread(payload.thread_id)
        understanding = self._get_or_create_session(thread.id, payload)
        self._set_initial_input(understanding, payload.user_input)
        if payload.answer:
            self._append_answer(understanding, payload.answer.question_id, payload.answer.answer_text)

        answers = self.workflow.current_answers(understanding.id)
        answer_map = {answer.question_id: answer.answer_text for answer in answers}
        missing_index = next((index for index, question in enumerate(QUESTIONS) if question.id not in answer_map), None)
        if missing_index is None:
            summary = generate_understanding(understanding.user_input, answer_map)
            understanding.real_goal = summary["real_goal"]
            understanding.foundation = summary["foundation"]
            understanding.constraints_summary = summary["constraints"]
            understanding.tension = summary["tension"]
            understanding.uncertain = summary["uncertain"]
            understanding.summary_version = max(1, understanding.summary_version + 1)
            understanding.status = "reviewing"
            understanding.current_question_index = len(QUESTIONS) - 1
            thread.current_step = "reviewing_understanding"
            thread.phase = "理解确认"
            next_question = None
        else:
            understanding.status = "collecting"
            understanding.current_question_index = missing_index
            thread.current_step = "asking_question"
            thread.phase = "理解目标" if missing_index == 0 else "核对现实"
            next_question = self._question(missing_index)

        thread.last_activity_at = datetime.now(UTC)
        self.session.flush()
        result = self._analyze_result(understanding, next_question)
        data = result.model_dump(mode="json")
        manager.store("understanding_session", understanding.id, data)
        self.session.commit()
        return data

    def confirm(self, session_id: str, payload: UnderstandingConfirmRequest, idempotency_key: str) -> dict:
        manager = IdempotencyManager(
            self.session,
            self.user_id,
            f"POST /api/understanding/{session_id}/confirm",
            idempotency_key,
            payload.model_dump(mode="json"),
        )
        if replay := manager.replay():
            return replay

        understanding = self._understanding(session_id)
        thread = self._thread(understanding.thread_id)
        if understanding.status != "reviewing" or not understanding.real_goal:
            raise APIError(
                status.HTTP_409_CONFLICT,
                "INVALID_FLOW_STATE",
                "当前理解尚未形成可确认摘要。",
                {"current_step": thread.current_step},
            )

        correction = None
        snapshot = None
        if payload.assessment == "accurate":
            understanding.status = "confirmed"
            understanding.confirmed_at = datetime.now(UTC)
            thread.current_step = "understanding_confirmed"
            thread.phase = "起点档案"
            goal = self._ensure_goal(understanding)
            self._ensure_constraint(understanding, goal)
            hypothesis = self._ensure_hypothesis(thread.id)
            hypotheses = [self._hypothesis_frontend(hypothesis)] if is_active_hypothesis(hypothesis) else []
            snapshot = SnapshotService(self.session, self.user_id).create_version(
                source_thread_id=thread.id,
                current_vector=goal.desired_outcome,
                reality_boundaries=[understanding.constraints_summary or "现实限制仍待补充"],
                hypotheses=hypotheses,
                recent_revision="理解已确认，并生成起点档案。",
            )
        else:
            if not payload.correction or not payload.correction.strip():
                raise APIError(
                    status.HTTP_422_UNPROCESSABLE_ENTITY,
                    "VALIDATION_ERROR",
                    "部分准确、不准确或补充信息时必须填写 correction。",
                )
            previous = understanding.uncertain or ""
            correction = UserCorrection(
                user_id=self.user_id,
                thread_id=thread.id,
                target_type="understanding",
                target_id=understanding.id,
                assessment=payload.assessment,
                previous_value=previous,
                user_value=payload.correction.strip(),
                system_handling="已写入最新理解摘要，等待用户再次确认。",
                has_conflict=payload.assessment == "inaccurate",
            )
            self.session.add(correction)
            understanding.uncertain = f"用户补充：{payload.correction.strip()}"
            understanding.summary_version += 1
            snapshot = SnapshotService(self.session, self.user_id).create_version(
                source_thread_id=thread.id,
                user_correction=payload.correction.strip(),
                recent_revision="用户纠正了理解摘要。",
            )

        thread.last_activity_at = datetime.now(UTC)
        self.session.flush()
        result = UnderstandingConfirmResult(
            session=UnderstandingSessionRead.model_validate(understanding),
            understanding=self._summary(understanding),
            correction=CorrectionRead.model_validate(correction) if correction else None,
            snapshot=SnapshotRead.model_validate(snapshot) if snapshot else None,
            current_step=thread.current_step,
        )
        data = result.model_dump(mode="json")
        manager.store("understanding_session", understanding.id, data)
        self.session.commit()
        return data

    def _thread(self, thread_id: str):
        thread = self.workflow.get_thread(thread_id, self.user_id)
        if thread is None:
            raise APIError(status.HTTP_404_NOT_FOUND, "RESOURCE_NOT_FOUND", "任务线程不存在。")
        return thread

    def _understanding(self, session_id: str) -> UnderstandingSession:
        understanding = self.workflow.get_understanding(session_id, self.user_id)
        if understanding is None:
            raise APIError(status.HTTP_404_NOT_FOUND, "RESOURCE_NOT_FOUND", "理解会话不存在。")
        return understanding

    def _get_or_create_session(self, thread_id: str, payload: UnderstandingAnalyzeRequest) -> UnderstandingSession:
        if payload.session_id:
            understanding = self._understanding(payload.session_id)
            if understanding.thread_id != thread_id:
                raise APIError(status.HTTP_404_NOT_FOUND, "RESOURCE_NOT_FOUND", "理解会话不属于当前线程。")
            if understanding.status == "confirmed":
                raise APIError(status.HTTP_409_CONFLICT, "INVALID_FLOW_STATE", "已确认理解不能继续追加回答。")
            return understanding
        if payload.expression_mode is None:
            raise APIError(status.HTTP_422_UNPROCESSABLE_ENTITY, "VALIDATION_ERROR", "首次分析必须选择表达方式。")
        thread = self._thread(thread_id)
        understanding = UnderstandingSession(
            id=new_id(),
            thread_id=thread_id,
            user_id=self.user_id,
            previous_session_id=thread.active_understanding_session_id,
            expression_mode=payload.expression_mode,
            status="collecting",
            user_input=payload.user_input.strip() if payload.user_input else None,
        )
        self.session.add(understanding)
        self.session.flush()
        thread.active_understanding_session_id = understanding.id
        return understanding

    def _set_initial_input(self, understanding: UnderstandingSession, user_input: str | None) -> None:
        if not user_input or not user_input.strip():
            if understanding.expression_mode in {"speak", "sort"} and not understanding.user_input:
                raise APIError(status.HTTP_422_UNPROCESSABLE_ENTITY, "VALIDATION_ERROR", "当前表达方式需要先输入目标。")
            return
        value = user_input.strip()
        if understanding.user_input is None:
            understanding.user_input = value
        elif understanding.user_input != value:
            raise APIError(
                status.HTTP_409_CONFLICT,
                "INVALID_FLOW_STATE",
                "原始表达不可覆盖，请创建新的理解会话。",
            )

    def _append_answer(self, understanding: UnderstandingSession, question_id: str, answer_text: str) -> None:
        question = QUESTION_MAP[question_id]
        current_answers = self.workflow.current_answers(understanding.id)
        current_map = {answer.question_id: answer for answer in current_answers}
        expected = next((item.id for item in QUESTIONS if item.id not in current_map), None)
        previous = current_map.get(question_id)
        if previous is None and expected != question_id:
            raise APIError(
                status.HTTP_409_CONFLICT,
                "INVALID_FLOW_STATE",
                "必须按服务端返回的问题顺序回答。",
                {"expected_question_id": expected},
            )
        if previous:
            previous.is_current = False
        self.session.add(
            Answer(
                understanding_session_id=understanding.id,
                question_id=question_id,
                question_text=question.prompt,
                question_order=QUESTIONS.index(question),
                answer_text=answer_text.strip(),
                revision=(previous.revision + 1) if previous else 1,
                is_current=True,
                supersedes_answer_id=previous.id if previous else None,
                answered_at=datetime.now(UTC),
            )
        )
        self.session.flush()

    def _analyze_result(self, understanding: UnderstandingSession, next_question: QuestionRead | None):
        answers = self.workflow.current_answers(understanding.id)
        return UnderstandingAnalyzeResult(
            session=UnderstandingSessionRead.model_validate(understanding),
            current_answers=[AnswerRead.model_validate(answer) for answer in answers],
            next_question=next_question,
            understanding=self._summary(understanding) if understanding.real_goal else None,
            current_step="reviewing_understanding" if understanding.status == "reviewing" else "asking_question",
        )

    @staticmethod
    def _question(index: int) -> QuestionRead:
        question = QUESTIONS[index]
        return QuestionRead(
            id=question.id,
            prompt=question.prompt,
            hint=question.hint,
            index=index,
            total=len(QUESTIONS),
        )

    @staticmethod
    def _summary(understanding: UnderstandingSession) -> UnderstandingSummaryRead:
        return UnderstandingSummaryRead(
            real_goal=understanding.real_goal or "",
            foundation=understanding.foundation or "",
            constraints=understanding.constraints_summary or "",
            tension=understanding.tension or "",
            uncertain=understanding.uncertain or "",
        )

    def _ensure_goal(self, understanding: UnderstandingSession) -> Goal:
        goal = self.workflow.goal_for_understanding(understanding.id)
        if goal:
            return goal
        goal = Goal(
            user_id=self.user_id,
            thread_id=understanding.thread_id,
            understanding_session_id=understanding.id,
            original_expression=understanding.user_input or understanding.real_goal or "",
            title=(understanding.real_goal or "已确认目标")[:240],
            desired_outcome=understanding.real_goal or "",
            success_criteria="结果可以被明确检查并完成一次真实验证。",
            goal_type="project",
            priority="primary",
            status="active",
            current_stage="后端核心闭环",
            estimated_load="medium",
            feasibility="medium",
            feasibility_basis="已有规格和前端 Mock 流程，当前需要后端持久化闭环。",
            user_confirmed=True,
        )
        self.session.add(goal)
        self.session.flush()
        return goal

    def _ensure_constraint(self, understanding: UnderstandingSession, goal: Goal) -> None:
        existing = self.session.scalar(
            select(Constraint).where(Constraint.thread_id == understanding.thread_id, Constraint.goal_id == goal.id)
        )
        if existing:
            return
        self.session.add(
            Constraint(
                user_id=self.user_id,
                thread_id=understanding.thread_id,
                goal_id=goal.id,
                content=understanding.constraints_summary or "现实限制仍待确认",
                constraint_type="fixed",
                severity="medium",
                source_type="user_confirmed",
                is_hard=True,
                user_confirmed=True,
                last_reviewed_at=datetime.now(UTC),
            )
        )

    def _ensure_hypothesis(self, thread_id: str) -> Hypothesis:
        semantic_key = hypothesis_semantic_key(EXECUTION_AVOIDANCE_CATEGORY, EXECUTION_AVOIDANCE_CONTENT)
        hypothesis = self.workflow.active_hypothesis(thread_id, EXECUTION_AVOIDANCE_CATEGORY)
        if hypothesis:
            return hypothesis
        hypothesis = self.workflow.hypothesis_by_semantic_key(thread_id, semantic_key)
        if hypothesis:
            return hypothesis
        hypothesis = Hypothesis(
            user_id=self.user_id,
            thread_id=thread_id,
            content=EXECUTION_AVOIDANCE_CONTENT,
            category=EXECUTION_AVOIDANCE_CATEGORY,
            semantic_key=semantic_key,
            status="pending",
            confidence_internal=0.5,
            supporting_evidence=[],
            opposing_evidence=[],
            requires_confirmation=True,
        )
        self.session.add(hypothesis)
        self.session.flush()
        return hypothesis

    @staticmethod
    def _hypothesis_frontend(hypothesis: Hypothesis) -> dict:
        return {"id": hypothesis.id, "content": hypothesis.content, "status": hypothesis.status}
