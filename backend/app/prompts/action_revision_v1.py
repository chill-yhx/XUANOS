from app.engines.context import DecisionContext
from app.engines.schemas import ActionRevisionCandidate
from app.prompts.common import build_structured_prompt
from app.prompts.types import PromptSpec

PROMPT_VERSION = "action_revision_v1"
OUTPUT_EXAMPLE = {
    "actual_result": "<result grounded in action evidence>",
    "revised_judgment": "<bounded revision grounded in evidence>",
    "next_adjustment": "<one concrete adjusted action>",
    "next_stage": "<short next stage>",
    "pattern": "<tentative pattern, not an unsupported fact>",
    "hypothesis_status": "pending",
    "unknown_information": [],
}


def build_prompt(context: DecisionContext) -> PromptSpec:
    return build_structured_prompt(
        version=PROMPT_VERSION,
        task="Produce a candidate ActionRevisionDecision from the supplied action evidence and current context.",
        context=context,
        output_schema=ActionRevisionCandidate,
        output_example=OUTPUT_EXAMPLE,
    )
