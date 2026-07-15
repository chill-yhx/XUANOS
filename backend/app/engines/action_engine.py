from typing import Protocol

from app.engines.schemas import ActionFeedbackContext, ActionRevisionDecision


class ActionEngine(Protocol):
    def revise(self, context: ActionFeedbackContext) -> ActionRevisionDecision: ...


class DeterministicActionEngine:
    """Turns recorded action evidence into a user-specific next adjustment."""

    _obstacle_labels = {
        "low_energy": "精力不足",
        "unclear_action": "行动不清晰",
        "action_unclear": "行动不清晰",
        "lack_of_time": "时间不足",
        "time_conflict": "时间冲突",
        "emotional_resistance": "情绪阻力",
        "environment_interrupt": "环境打断",
        "missing_resource": "资源不足",
        "task_too_large": "任务过大",
        "other": "其他阻力",
    }

    def revise(self, context: ActionFeedbackContext) -> ActionRevisionDecision:
        obstacle = self._obstacle_labels.get(context.obstacle_code, context.obstacle_code)
        duration = (
            f"{context.actual_duration_minutes} 分钟" if context.actual_duration_minutes is not None else "未记录"
        )
        if not context.started:
            return ActionRevisionDecision(
                actual_result=f"本次没有开始，记录的主要阻力是{obstacle}。",
                revised_judgment=f"“{context.action}”当前的启动门槛仍然偏高，需要先缩小到可开始的版本。",
                next_adjustment=f"将“{context.action}”缩小为 15 分钟启动版本，只完成第一步。",
                next_stage="行动启动",
                pattern=f"当“{context.goal}”的启动动作更小、更明确时，更容易开始。",
                hypothesis_status="pending",
            )
        if context.completed:
            return ActionRevisionDecision(
                actual_result=f"本次已完成，实际用时 {duration}，记录的主要阻力是{obstacle}。",
                revised_judgment=f"“{context.action}”在当前现实边界内可以完成，可以进入下一轮小范围验证。",
                next_adjustment=f"为“{context.goal}”确定下一次最小行动，并安排一个具体时间段。",
                next_stage="行动复查",
                pattern=f"围绕“{context.goal}”的行动在范围明确时可以形成完成反馈。",
                hypothesis_status="verified",
            )
        return ActionRevisionDecision(
            actual_result=(f"本次完成 {context.progress_percent}% ，实际用时 {duration}，记录的主要阻力是{obstacle}。"),
            revised_judgment=f"“{context.action}”可以推进，但仍需根据已暴露的阻力继续收束范围。",
            next_adjustment=f"将“{context.action}”拆成一个 15 分钟版本，先完成剩余部分的第一段。",
            next_stage="行动收束",
            pattern=f"将“{context.goal}”拆成更小步骤后，推进阻力更容易被识别。",
            hypothesis_status="pending",
        )
