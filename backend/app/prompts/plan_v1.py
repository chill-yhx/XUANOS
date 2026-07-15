from app.engines.context import DecisionContext
from app.engines.schemas import PlanCandidate
from app.prompts.common import build_structured_prompt
from app.prompts.types import PromptSpec

PROMPT_VERSION = "plan_v1"
OUTPUT_EXAMPLE = {
    "stage": "<short current stage>",
    "summary": "<context-grounded plan summary>",
    "single_action": "<one concrete action serving the primary goal>",
    "completion_standard": "<observable completion standard>",
    "review_condition": "<explicit review trigger>",
    "workload": "low",
    "system_recommendation": "<bounded recommendation>",
    "items": [
        {
            "item_type": "action",
            "title": "<same concrete action>",
            "sort_order": 1,
            "estimated_minutes": 30,
            "completion_standard": "<observable result>",
        }
    ],
    "maintenance_goals": [],
    "paused_goals": [],
    "deleted_items": [],
    "unknown_information": [],
}


def build_prompt(context: DecisionContext) -> PromptSpec:
    return build_structured_prompt(
        version=PROMPT_VERSION,
        task=(
            "Produce a candidate PlanDecision. Return empty maintenance_goals, paused_goals, "
            "and deleted_items when unsupported."
        ),
        context=context,
        output_schema=PlanCandidate,
        output_example=OUTPUT_EXAMPLE,
    )
