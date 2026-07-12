from dataclasses import dataclass


@dataclass(frozen=True)
class RevisionDecision:
    actual_result: str
    revised_judgment: str
    next_adjustment: str
    next_stage: str
    pattern: str
    hypothesis_status: str


def analyze_feedback(
    *,
    started: bool,
    completed: bool,
    progress_percent: int,
    actual_duration_minutes: int | None,
    obstacle_code: str,
) -> RevisionDecision:
    duration = f"{actual_duration_minutes} 分钟" if actual_duration_minutes is not None else "未记录"
    actual_result = (
        f"完成 {progress_percent}%，实际用时 {duration}，最大阻力为 {obstacle_code}。"
        if started
        else f"本次没有开始，最大阻力为 {obstacle_code}。"
    )
    if completed:
        return RevisionDecision(
            actual_result,
            "明确范围后可以完成闭环，下一轮应转向真实可用性验证。",
            "完整复测后端流程并准备前端 API mapper。",
            "闭环复测",
            "以完整可运行闭环作为完成标准有效",
            "denied",
        )
    if started and progress_percent >= 50:
        return RevisionDecision(
            actual_result,
            "计划方向有效，但任务范围仍需按剩余工作收缩。",
            "完成剩余后端闭环，不新增范围。",
            "后端闭环收束",
            "任务限定为单一闭环时更容易推进",
            "pending",
        )
    return RevisionDecision(
        actual_result,
        "任务需要更小、更明确的启动动作。",
        "只完成理解分析与确认接口的联调准备。",
        "启动阻力校准",
        "任务缩小到单一交付物时更容易启动",
        "verified",
    )
