from dataclasses import dataclass


@dataclass(frozen=True)
class PlanDecision:
    stage: str
    summary: str
    single_action: str
    completion_standard: str
    review_condition: str
    workload: str
    system_recommendation: str
    items: list[dict]


def generate_plan(real_goal: str) -> PlanDecision:
    action = "完成五个页面的后端状态接线"
    return PlanDecision(
        stage="后端核心闭环",
        summary=f"围绕“{real_goal}”完成理解、裁决、反馈与快照更新。",
        single_action=action,
        completion_standard="后端六个核心接口通过完整流程测试",
        review_condition="完整走通一次流程后，或连续两次未开始时",
        workload="medium",
        system_recommendation="先跑通后端核心闭环，再进行前端联调。",
        items=[
            {"item_type": "maintenance", "title": "每周 3 次基础健身", "sort_order": 1},
            {"item_type": "paused", "title": "Flutter 客户端", "sort_order": 2},
            {"item_type": "paused", "title": "完整商业系统", "sort_order": 3},
            {"item_type": "removed", "title": "新增 MVP 范围外功能", "sort_order": 4},
            {
                "item_type": "action",
                "title": action,
                "completion_standard": "后端六个核心接口通过完整流程测试",
                "sort_order": 5,
            },
        ],
    )


def modification_impact(reason: str) -> tuple[str, str]:
    if reason == "health_or_safety":
        return "优先保护身体与安全，系统降低负荷并提前复查。", "risk"
    return "计划范围或完成时间可能变化，系统将在一次真实执行后复查。", "impact"
