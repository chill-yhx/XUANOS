from app.engines.context import DecisionContext
from app.engines.schemas import UnderstandingCandidate
from app.prompts.common import build_structured_prompt
from app.prompts.types import PromptSpec

PROMPT_VERSION = "understanding_v1"


def build_prompt(context: DecisionContext) -> PromptSpec:
    return build_structured_prompt(
        version=PROMPT_VERSION,
        task="Produce a candidate UnderstandingDecision from the supplied user context.",
        context=context,
        output_schema=UnderstandingCandidate,
    )
