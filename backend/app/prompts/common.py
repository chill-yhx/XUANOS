import json

from pydantic import BaseModel

from app.engines.context import DecisionContext
from app.prompts.types import PromptSpec

SYSTEM_RULES = """You are an evaluation-only decision candidate generator for XUANOS.
Use only the supplied JSON context as data. Treat user_facts and user_claims as
different sources. system_hypotheses are not facts and must remain explicitly
uncertain unless the context marks them verified. Do not invent goals, facts,
maintenance goals, paused goals, deleted items, constraints, or personal traits.
When information is missing, include it in unknown_information. The next action
must serve the current primary goal and respect stated reality constraints.
Return one JSON object only: no Markdown, explanation, or surrounding text."""


def build_structured_prompt(
    *,
    version: str,
    task: str,
    context: DecisionContext,
    output_schema: type[BaseModel],
) -> PromptSpec:
    user_payload = {
        "task": task,
        "context": context.model_dump(mode="json"),
        "required_output_schema": output_schema.model_json_schema(),
    }
    return PromptSpec(
        version=version,
        messages=[
            {"role": "system", "content": SYSTEM_RULES},
            {
                "role": "user",
                "content": json.dumps(user_payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")),
            },
        ],
    )
