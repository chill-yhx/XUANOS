from copy import deepcopy
from datetime import UTC, datetime
from typing import Any

from fastapi import status
from sqlalchemy.orm import Session

from app.core.errors import APIError
from app.core.idempotency import IdempotencyManager
from app.models.goal import Constraint, Goal
from app.models.hypothesis import Hypothesis
from app.models.plan import Plan
from app.models.snapshot import UserSnapshot
from app.models.understanding import UnderstandingSession, UserCorrection
from app.rules.correction_mock import decide_correction
from app.schemas.correction import UserCorrectionCreate, UserCorrectionRead, UserCorrectionResult
from app.schemas.snapshot import SnapshotRead
from app.services.snapshot_service import SnapshotService

SYSTEM_SECTION_IDS = {"vector", "bounds", "working", "review", "revision", "corrections"}
TARGET_MODELS = {
    "understanding": UnderstandingSession,
    "goal": Goal,
    "constraint": Constraint,
    "plan": Plan,
    "snapshot": UserSnapshot,
    "hypothesis": Hypothesis,
}


class CorrectionService:
    def __init__(self, session: Session, user_id: str) -> None:
        self.session = session
        self.user_id = user_id
        self.snapshots = SnapshotService(session, user_id)

    def create(self, payload: UserCorrectionCreate, idempotency_key: str) -> dict:
        current_snapshot = self.snapshots.get_current()
        manager = IdempotencyManager(
            self.session,
            self.user_id,
            "POST /api/users/me/corrections",
            idempotency_key,
            payload.model_dump(mode="json"),
        )
        if replay := manager.replay():
            return replay

        target, thread_id = self._resolve_target(payload, current_snapshot)
        decision = decide_correction(payload.correction_type, payload.target_type)
        correction = UserCorrection(
            user_id=self.user_id,
            thread_id=thread_id,
            target_type=payload.target_type,
            target_id=payload.target_id,
            assessment=payload.correction_type,
            previous_value=payload.original_value.strip(),
            user_value=payload.corrected_value.strip(),
            reason=payload.reason.strip(),
            system_handling=decision.system_handling,
            has_conflict=False,
        )
        self.session.add(correction)
        self.session.flush()
        self._apply_target_attitude(target, payload, correction.id)
        replacement_hypothesis = self._create_replacement_hypothesis(
            target,
            payload,
            correction.id,
        )

        snapshot = current_snapshot
        if decision.snapshot_required:
            changes = self._snapshot_changes(
                current_snapshot,
                payload,
                target,
                correction.id,
                replacement_hypothesis.id if replacement_hypothesis else None,
            )
            snapshot = self.snapshots.create_version(
                source_thread_id=thread_id or current_snapshot.source_thread_id,
                recent_revision=decision.recent_revision,
                user_correction=f"{payload.target_type}：{payload.corrected_value.strip()}",
                increment_revision=True,
                **changes,
            )

        self.session.flush()
        result = UserCorrectionResult(
            correction=UserCorrectionRead.model_validate(correction),
            snapshot=SnapshotRead.model_validate(snapshot),
            snapshot_updated=decision.snapshot_required,
        )
        data = result.model_dump(mode="json")
        manager.store("user_correction", correction.id, data)
        self.session.commit()
        return data

    def _resolve_target(
        self,
        payload: UserCorrectionCreate,
        current_snapshot: UserSnapshot,
    ) -> tuple[object | None, str | None]:
        if payload.target_type == "system_section":
            if payload.target_id not in SYSTEM_SECTION_IDS:
                raise APIError(
                    status.HTTP_422_UNPROCESSABLE_ENTITY,
                    "VALIDATION_ERROR",
                    "不支持的系统快照区域。",
                    {"target_id": payload.target_id},
                )
            return None, current_snapshot.source_thread_id

        model = TARGET_MODELS[payload.target_type]
        target = self.session.get(model, payload.target_id)
        if target is None or getattr(target, "user_id", None) != self.user_id:
            raise APIError(
                status.HTTP_404_NOT_FOUND,
                "RESOURCE_NOT_FOUND",
                "纠正目标不存在。",
                {"target_type": payload.target_type, "target_id": payload.target_id},
            )
        thread_id = getattr(target, "thread_id", None) or getattr(target, "source_thread_id", None)
        return target, thread_id

    @staticmethod
    def _apply_target_attitude(target: object | None, payload: UserCorrectionCreate, correction_id: str) -> None:
        if not isinstance(target, Hypothesis):
            return
        evidence = {"user_correction_id": correction_id, "correction_type": payload.correction_type}
        target.last_reviewed_at = datetime.now(UTC)
        target.requires_confirmation = False
        if payload.correction_type == "accurate":
            target.user_attitude = "accepted"
            target.supporting_evidence = [*target.supporting_evidence, evidence]
        elif payload.correction_type == "partial":
            target.user_attitude = "partial"
            target.status = "expired"
            target.opposing_evidence = [*target.opposing_evidence, evidence]
        else:
            target.user_attitude = "rejected"
            target.status = "expired" if payload.correction_type == "changed" else "denied"
            target.opposing_evidence = [*target.opposing_evidence, evidence]

    def _create_replacement_hypothesis(
        self,
        target: object | None,
        payload: UserCorrectionCreate,
        correction_id: str,
    ) -> Hypothesis | None:
        if not isinstance(target, Hypothesis) or payload.correction_type != "partial":
            return None
        replacement = Hypothesis(
            user_id=target.user_id,
            thread_id=target.thread_id,
            content=payload.corrected_value.strip(),
            category=target.category,
            status="pending",
            confidence_internal=None,
            supporting_evidence=[{"user_correction_id": correction_id, "correction_type": "partial"}],
            opposing_evidence=[],
            requires_confirmation=False,
            user_attitude="accepted",
            last_reviewed_at=datetime.now(UTC),
        )
        self.session.add(replacement)
        self.session.flush()
        return replacement

    def _snapshot_changes(
        self,
        snapshot: UserSnapshot,
        payload: UserCorrectionCreate,
        target: object | None,
        correction_id: str,
        replacement_hypothesis_id: str | None = None,
    ) -> dict[str, Any]:
        if payload.target_type == "goal":
            return {
                "current_vector": (
                    "等待重新校准" if payload.correction_type == "discontinue" else payload.corrected_value.strip()
                )
            }
        if payload.target_type == "plan":
            return {
                "current_action": (
                    "等待重新裁决" if payload.correction_type == "discontinue" else payload.corrected_value.strip()
                )
            }
        if payload.target_type == "constraint":
            return {
                "reality_boundaries": self._replace_text_values(
                    snapshot.reality_boundaries,
                    payload,
                )
            }
        if payload.target_type == "hypothesis" and isinstance(target, Hypothesis):
            return {
                "hypotheses": self._replace_hypotheses(
                    snapshot.hypotheses,
                    payload,
                    correction_id,
                    target.id,
                    replacement_hypothesis_id,
                )
            }
        if payload.target_type == "system_section":
            return self._system_section_changes(snapshot, payload, correction_id)
        return self._replace_known_snapshot_value(snapshot, payload, correction_id)

    def _system_section_changes(
        self,
        snapshot: UserSnapshot,
        payload: UserCorrectionCreate,
        correction_id: str,
    ) -> dict[str, Any]:
        if payload.target_id == "vector":
            return {
                "current_vector": (
                    "等待重新校准" if payload.correction_type == "discontinue" else payload.corrected_value.strip()
                )
            }
        if payload.target_id == "bounds":
            return {"reality_boundaries": self._replace_text_values(snapshot.reality_boundaries, payload)}
        if payload.target_id == "working":
            return {"effective_patterns": self._replace_patterns(snapshot.effective_patterns, payload)}
        if payload.target_id == "review":
            return {
                "hypotheses": self._replace_hypotheses(
                    snapshot.hypotheses,
                    payload,
                    correction_id,
                )
            }
        return {}

    def _replace_known_snapshot_value(
        self,
        snapshot: UserSnapshot,
        payload: UserCorrectionCreate,
        correction_id: str,
    ) -> dict[str, Any]:
        original = payload.original_value.strip()
        replacement = payload.corrected_value.strip()
        discontinue = payload.correction_type == "discontinue"
        if snapshot.current_vector == original:
            return {"current_vector": "等待重新校准" if discontinue else replacement}
        if snapshot.current_stage == original:
            return {"current_stage": "等待重新校准" if discontinue else replacement}
        if snapshot.current_action == original:
            return {"current_action": "等待重新裁决" if discontinue else replacement}
        if original in snapshot.reality_boundaries:
            return {"reality_boundaries": self._replace_text_values(snapshot.reality_boundaries, payload)}
        if any(item.get("content") == original for item in snapshot.effective_patterns):
            return {"effective_patterns": self._replace_patterns(snapshot.effective_patterns, payload)}
        if any(item.get("content") == original for item in snapshot.hypotheses):
            return {"hypotheses": self._replace_hypotheses(snapshot.hypotheses, payload, correction_id)}
        return {}

    @staticmethod
    def _replace_text_values(values: list[str], payload: UserCorrectionCreate) -> list[str]:
        original = payload.original_value.strip()
        corrected = payload.corrected_value.strip()
        result = [item for item in values if item != original]
        if payload.correction_type != "discontinue" and corrected not in result:
            result = [corrected, *result]
        return result

    @staticmethod
    def _replace_patterns(patterns: list[dict[str, Any]], payload: UserCorrectionCreate) -> list[dict[str, Any]]:
        original = payload.original_value.strip()
        corrected = payload.corrected_value.strip()
        result = [deepcopy(item) for item in patterns if item.get("content") != original]
        if payload.correction_type != "discontinue" and not any(item.get("content") == corrected for item in result):
            result.insert(0, {"content": corrected, "maturity": "candidate"})
        return result

    @staticmethod
    def _replace_hypotheses(
        hypotheses: list[dict[str, Any]],
        payload: UserCorrectionCreate,
        correction_id: str,
        target_id: str | None = None,
        replacement_hypothesis_id: str | None = None,
    ) -> list[dict[str, Any]]:
        original = payload.original_value.strip()
        corrected = payload.corrected_value.strip()
        result = [
            deepcopy(item) for item in hypotheses if item.get("id") != target_id and item.get("content") != original
        ]
        if payload.correction_type == "partial" and not any(item.get("content") == corrected for item in result):
            result.insert(
                0,
                {
                    "id": replacement_hypothesis_id or f"correction-{correction_id}",
                    "content": corrected,
                    "status": "pending",
                },
            )
        return result
