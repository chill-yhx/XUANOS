from app.engines.context import DecisionContext
from app.engines.schemas import ActionRevisionCandidate
from app.prompts.common import build_structured_prompt
from app.prompts.types import PromptSpec

PROMPT_VERSION = "action_revision_v1"


def build_prompt(context: DecisionContext) -> PromptSpec:
    return build_structured_prompt(
        version=PROMPT_VERSION,
        task="Produce a candidate ActionRevisionDecision from the supplied action evidence and current context.",
        context=context,
        output_schema=ActionRevisionCandidate,
    )
