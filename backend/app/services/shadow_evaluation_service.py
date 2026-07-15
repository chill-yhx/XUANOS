from __future__ import annotations

import hashlib
import json
import logging
from time import perf_counter

from fastapi import BackgroundTasks
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.engines.errors import ShadowProviderError
from app.engines.evaluation import evaluate_candidate
from app.engines.provider import get_shadow_provider
from app.engines.schemas import ShadowEvaluationIntent, candidate_schema_for
from app.models.shadow_evaluation import ShadowEvaluation
from app.prompts import action_revision_v1, plan_v1, understanding_v1
from app.prompts.types import PromptSpec
from app.repositories.evaluations import ShadowEvaluationRepository

logger = logging.getLogger(__name__)


def schedule_shadow_evaluation(background_tasks: BackgroundTasks, intent: ShadowEvaluationIntent | None) -> None:
    """Queue a best-effort task only after the formal response is ready."""

    if intent is None or not get_settings().llm_shadow_enabled:
        return
    background_tasks.add_task(run_shadow_evaluation, intent)


def run_shadow_evaluation(intent: ShadowEvaluationIntent) -> None:
    try:
        with SessionLocal() as session:
            ShadowEvaluationService(session).evaluate(intent)
    except Exception:
        # Shadow execution must not leak provider details or affect workflow responses.
        logger.error("Shadow evaluation task failed")


class ShadowEvaluationService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.evaluations = ShadowEvaluationRepository(session)

    def evaluate(self, intent: ShadowEvaluationIntent) -> ShadowEvaluation | None:
        settings = get_settings()
        if not settings.llm_shadow_enabled:
            return None

        prompt = _prompt_for(intent)
        context_hash = _context_hash(intent)
        started_at = perf_counter()
        configured_provider = settings.decision_engine_provider.strip().casefold()
        try:
            provider = get_shadow_provider()
        except ShadowProviderError as error:
            return self._store_failure(
                intent=intent,
                prompt=prompt,
                context_hash=context_hash,
                provider=configured_provider,
                model=settings.llm_model,
                latency_ms=_latency_ms(started_at),
                error_code=error.code,
            )
        except Exception:
            return self._store_failure(
                intent=intent,
                prompt=prompt,
                context_hash=context_hash,
                provider=configured_provider,
                model=settings.llm_model,
                latency_ms=_latency_ms(started_at),
                error_code="EVALUATION_FAILED",
            )

        try:
            raw_candidate = provider.generate(prompt)
        except ShadowProviderError as error:
            return self._store_failure(
                intent=intent,
                prompt=prompt,
                context_hash=context_hash,
                provider=provider.provider_name,
                model=provider.model_name,
                latency_ms=_latency_ms(started_at),
                error_code=error.code,
            )
        except Exception:
            return self._store_failure(
                intent=intent,
                prompt=prompt,
                context_hash=context_hash,
                provider=provider.provider_name,
                model=provider.model_name,
                latency_ms=_latency_ms(started_at),
                error_code="EVALUATION_FAILED",
            )

        latency_ms = _latency_ms(started_at)
        try:
            candidate_payload = json.loads(raw_candidate)
        except (json.JSONDecodeError, TypeError, ValueError):
            return self._store_failure(
                intent=intent,
                prompt=prompt,
                context_hash=context_hash,
                provider=provider.provider_name,
                model=provider.model_name,
                latency_ms=latency_ms,
                error_code="CANDIDATE_INVALID_JSON",
            )
        try:
            candidate = candidate_schema_for(intent.decision_type).model_validate(candidate_payload)
        except ValidationError:
            return self._store_failure(
                intent=intent,
                prompt=prompt,
                context_hash=context_hash,
                provider=provider.provider_name,
                model=provider.model_name,
                latency_ms=latency_ms,
                error_code="CANDIDATE_SCHEMA_INVALID",
            )

        candidate_output = candidate.model_dump(mode="json")
        try:
            metrics = evaluate_candidate(
                decision_type=intent.decision_type,
                context=intent.context,
                baseline_output=intent.baseline_output,
                candidate_output=candidate_output,
            )
        except Exception:
            return self._store_failure(
                intent=intent,
                prompt=prompt,
                context_hash=context_hash,
                provider=provider.provider_name,
                model=provider.model_name,
                latency_ms=latency_ms,
                error_code="EVALUATION_FAILED",
            )
        evaluation = ShadowEvaluation(
            user_id=intent.user_id,
            thread_id=intent.thread_id,
            decision_type=intent.decision_type,
            provider=provider.provider_name,
            model_name=provider.model_name,
            prompt_version=prompt.version,
            context_hash=context_hash,
            baseline_output=intent.baseline_output,
            candidate_output=candidate_output,
            schema_valid=True,
            latency_ms=latency_ms,
            provider_error=None,
            goal_alignment=metrics.goal_alignment,
            constraint_adherence=metrics.constraint_adherence,
            factual_grounding=metrics.factual_grounding,
            actionability=metrics.actionability,
            unsupported_assumptions=metrics.unsupported_assumptions,
            baseline_divergence=metrics.baseline_divergence,
            forbidden_term_hits=metrics.forbidden_term_hits,
        )
        self.evaluations.add(evaluation)
        self.session.commit()
        return evaluation

    def _store_failure(
        self,
        *,
        intent: ShadowEvaluationIntent,
        prompt: PromptSpec,
        context_hash: str,
        provider: str,
        model: str | None,
        latency_ms: int,
        error_code: str,
    ) -> ShadowEvaluation:
        evaluation = ShadowEvaluation(
            user_id=intent.user_id,
            thread_id=intent.thread_id,
            decision_type=intent.decision_type,
            provider=provider,
            model_name=model,
            prompt_version=prompt.version,
            context_hash=context_hash,
            baseline_output=intent.baseline_output,
            candidate_output=None,
            schema_valid=False,
            latency_ms=latency_ms,
            provider_error=error_code,
            goal_alignment="unknown",
            constraint_adherence="unknown",
            factual_grounding="unknown",
            actionability="unknown",
            unsupported_assumptions=[],
            baseline_divergence="unknown",
            forbidden_term_hits=[],
        )
        self.evaluations.add(evaluation)
        self.session.commit()
        return evaluation


def _prompt_for(intent: ShadowEvaluationIntent) -> PromptSpec:
    return {
        "understanding": understanding_v1.build_prompt,
        "plan": plan_v1.build_prompt,
        "action_revision": action_revision_v1.build_prompt,
    }[intent.decision_type](intent.context)


def _context_hash(intent: ShadowEvaluationIntent) -> str:
    serialized = json.dumps(
        intent.context.model_dump(mode="json"),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def _latency_ms(started_at: float) -> int:
    return max(0, round((perf_counter() - started_at) * 1000))
