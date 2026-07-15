from app.engines.context import DecisionContext
from app.engines.schemas import PlanCandidate
from app.prompts.common import build_structured_prompt
from app.prompts.types import PromptSpec

PROMPT_VERSION = "plan_v1"


def build_prompt(context: DecisionContext) -> PromptSpec:
    return build_structured_prompt(
        version=PROMPT_VERSION,
        task=(
            "Produce a candidate PlanDecision. Return empty maintenance_goals, paused_goals, "
            "and deleted_items when unsupported."
        ),
        context=context,
        output_schema=PlanCandidate,
    )
