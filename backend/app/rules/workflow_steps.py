WORKFLOW_STEP_ORDER = (
    "idle",
    "expression_mode",
    "collecting_input",
    "asking_question",
    "reviewing_understanding",
    "understanding_confirmed",
    "plan_generated",
    "plan_modified",
    "plan_accepted",
    "action_pending",
    "feedback_submitted",
    "system_revised",
)

WORKFLOW_STEP_RANK = {step: rank for rank, step in enumerate(WORKFLOW_STEP_ORDER)}

ALLOWED_WORKFLOW_TRANSITIONS = {
    "idle": {"expression_mode"},
    "expression_mode": {"collecting_input", "asking_question"},
    "collecting_input": {"asking_question"},
    "asking_question": {"reviewing_understanding"},
    "reviewing_understanding": {"asking_question", "understanding_confirmed"},
    "understanding_confirmed": {"plan_generated"},
    "plan_generated": {"plan_modified", "plan_accepted"},
    "plan_modified": {"plan_accepted"},
    "plan_accepted": {"action_pending"},
    "action_pending": {"feedback_submitted", "system_revised"},
    "feedback_submitted": {"system_revised"},
    "system_revised": set(),
}


def is_known_workflow_step(step: str) -> bool:
    return step in WORKFLOW_STEP_RANK


def advance_workflow_step(current: str, target: str) -> str:
    if current == target:
        return current
    if target not in ALLOWED_WORKFLOW_TRANSITIONS.get(current, set()):
        raise ValueError(f"Workflow step cannot advance from {current!r} to {target!r}")
    return target


def later_workflow_step(current: str, minimum: str) -> str:
    current_rank = WORKFLOW_STEP_RANK.get(current)
    minimum_rank = WORKFLOW_STEP_RANK.get(minimum)
    if minimum_rank is None:
        raise ValueError(f"Unknown workflow step: {minimum!r}")
    if current_rank is None or current_rank < minimum_rank:
        return minimum
    return current


def workflow_step_is_at_least(current: str, minimum: str) -> bool:
    current_rank = WORKFLOW_STEP_RANK.get(current)
    minimum_rank = WORKFLOW_STEP_RANK.get(minimum)
    if current_rank is None or minimum_rank is None:
        return False
    return current_rank >= minimum_rank
