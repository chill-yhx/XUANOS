from collections.abc import Mapping
from typing import Protocol

from app.engines.context import DecisionContext
from app.engines.schemas import DecisionQuestion, UnderstandingDecision


class UnderstandingEngine(Protocol):
    @property
    def questions(self) -> tuple[DecisionQuestion, ...]: ...

    def questions_for(self, context: DecisionContext) -> tuple[DecisionQuestion, ...]: ...

    def decide(self, context: DecisionContext) -> UnderstandingDecision: ...


class DeterministicUnderstandingEngine:
    """Input-driven baseline for the first-session understanding protocol."""

    _questions = (
        DecisionQuestion(
            "desired_result",
            "你最终想完成的具体结果是什么？",
            "描述一个可以判断是否完成的结果。",
        ),
        DecisionQuestion(
            "current_foundation",
            "你当前已经具备哪些基础？",
            "写下已有能力、资源或已完成部分。",
        ),
        DecisionQuestion(
            "real_constraints",
            "现实中有哪些时间、资源或安排限制？",
            "只写真正影响执行的边界。",
        ),
    )

    @property
    def questions(self) -> tuple[DecisionQuestion, ...]:
        return self._questions

    def questions_for(self, context: DecisionContext) -> tuple[DecisionQuestion, ...]:
        """Ask only for facts not already supplied in the expression."""

        answers = context.answer_map()
        known = {question_id for question_id, answer in answers.items() if answer and answer.strip()}
        if context.original_expression and context.original_expression.strip():
            known.add("desired_result")
        return tuple(question for question in self._questions if question.id not in known)

    def decide(self, context: DecisionContext) -> UnderstandingDecision:
        answers = context.answer_map()
        real_goal = self._value(answers, "desired_result", context.original_expression, "尚未明确的具体结果")
        foundation = self._value(answers, "current_foundation", None, "当前基础尚待补充")
        constraints = self._value(answers, "real_constraints", None, "现实限制尚待补充")
        return UnderstandingDecision(
            real_goal=real_goal,
            foundation=foundation,
            constraints=constraints,
            tension=f"要实现“{real_goal}”，需要在“{constraints}”的边界内使用现有基础“{foundation}”。",
            uncertain="首轮行动的实际用时、阻力和有效方法，仍需通过一次真实反馈验证。",
        )

    @staticmethod
    def _value(
        answers: Mapping[str, str],
        key: str,
        fallback: str | None,
        default: str,
    ) -> str:
        value = answers.get(key) or fallback or default
        return " ".join(value.strip().split())[:1000]
