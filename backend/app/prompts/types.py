from dataclasses import dataclass


@dataclass(frozen=True)
class PromptSpec:
    version: str
    messages: list[dict[str, str]]
