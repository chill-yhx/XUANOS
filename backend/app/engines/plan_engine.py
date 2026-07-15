import re
from typing import Protocol

from app.engines.context import DecisionContext
from app.engines.schemas import PlanDecision, PlanItemDecision, PlanModificationDecision


class PlanEngine(Protocol):
    def create_plan(self, context: DecisionContext) -> PlanDecision: ...

    def assess_modification(
        self,
        *,
        reason: str,
        original_action: str,
        user_final_choice: str,
    ) -> PlanModificationDecision: ...


class DeterministicPlanEngine:
    """Create a context-bound first action from goal structure and constraints."""

    def create_plan(self, context: DecisionContext) -> PlanDecision:
        goal = self._clean(context.primary_goal(), "当前目标")
        base = self._clean(context.foundation(), "现有基础待确认")
        limits = self._clean(context.constraints_text(), "现实限制待确认")
        minutes = self._timebox_minutes(limits)
        schedule = self._schedule_phrase(limits)
        stage, action, completion_standard, workload, action_minutes = self._first_action(
            goal,
            limits,
            schedule,
            minutes,
        )
        return PlanDecision(
            stage=stage,
            summary=f"围绕“{goal}”，先在“{limits}”的边界内验证一个可完成的起步行动。",
            single_action=action,
            completion_standard=completion_standard,
            review_condition="完成这次行动后，或连续两次未能开始时，复查行动范围与现实限制。",
            workload=workload,
            system_recommendation=f"优先利用已有基础“{base}”，先验证行动是否可执行，再扩展范围。",
            items=(
                PlanItemDecision(
                    item_type="action",
                    title=action,
                    sort_order=1,
                    estimated_minutes=action_minutes,
                    difficulty=2,
                    completion_standard=completion_standard,
                ),
            ),
        )

    def assess_modification(
        self,
        *,
        reason: str,
        original_action: str,
        user_final_choice: str,
    ) -> PlanModificationDecision:
        if reason == "health_or_safety":
            return PlanModificationDecision(
                expected_impact="优先保护身体与安全；行动负荷会降低，并在下一次反馈后提前复查。",
                warning_level="risk",
            )
        if reason in {"time_conflict", "resource_limit"}:
            return PlanModificationDecision(
                expected_impact="行动范围或完成时间会改变；系统会根据下一次真实反馈复查可执行性。",
                warning_level="impact",
            )
        return PlanModificationDecision(
            expected_impact="已保留原建议和你的最终选择；下一次反馈将用于验证新的行动是否更合适。",
            warning_level="info",
        )

    @classmethod
    def _first_action(
        cls,
        goal: str,
        limits: str,
        schedule: str,
        minutes: int,
    ) -> tuple[str, str, str, str, int]:
        if cls._is_priority_conflict(goal):
            action_minutes = min(minutes, 30)
            return (
                "目标取舍",
                (
                    f"在{schedule}用 {action_minutes} 分钟为“{goal}”中的各方向列出外部期限、预期收益和最低投入，"
                    "确定未来 14 天唯一主线。"
                ),
                "写下未来 14 天唯一主线、其余方向暂不推进的理由，以及一次复查日期。",
                "low",
                action_minutes,
            )
        if cls._is_habit_goal(goal):
            return (
                "习惯试做",
                f"在{schedule}完成一次 {minutes} 分钟的“{goal}”试做，并按“{limits}”执行。",
                "完成一次试做、记录实际时长，并预留本周其余可行时段。",
                "low" if minutes <= 30 else "medium",
                minutes,
            )
        if cls._is_measurement_goal(goal):
            return (
                "现状诊断",
                f"在{schedule}完成一次 {minutes} 分钟的“{goal}”现状诊断：记录当前状态、一个主要差距和下一次练习安排。",
                "记录当前状态、一个主要差距和下一次练习时间。",
                "low" if minutes <= 30 else "medium",
                minutes,
            )
        if cls._is_delivery_goal(goal):
            return (
                "最小交付验证",
                (
                    f"在{schedule}完成一个 {minutes} 分钟的“{goal}”最小可检查部分："
                    "只实现一个核心输入到输出路径并运行验证。"
                ),
                "留下一个可运行或可检查的最小结果，记录实际用时和第一个阻塞点。",
                "low" if minutes <= 30 else "medium",
                minutes,
            )
        if cls._is_learning_goal(goal):
            return (
                "技能起步练习",
                f"在{schedule}完成一次 {minutes} 分钟围绕“{goal}”的实际练习：选择第一个可验证单元并记录尝试结果。",
                "保留一次实际尝试记录、一个发现的差距和下一次练习安排。",
                "low" if minutes <= 30 else "medium",
                minutes,
            )
        return (
            "首轮真实尝试",
            f"在{schedule}完成“{goal}”中的第一个可验证单元，并记录实际步骤、结果和下一次安排。",
            "留下一个可检查的实际结果、实际用时和下一次安排。",
            "low" if minutes <= 30 else "medium",
            minutes,
        )

    @staticmethod
    def _is_priority_conflict(goal: str) -> bool:
        return any(marker in goal for marker in ("不知道先做", "优先级", "取舍"))

    @staticmethod
    def _is_habit_goal(goal: str) -> bool:
        return "习惯" in goal or ("每周" in goal and "次" in goal)

    @staticmethod
    def _is_measurement_goal(goal: str) -> bool:
        return any(marker in goal for marker in ("达到", "提升", "提高", "目标分"))

    @staticmethod
    def _is_delivery_goal(goal: str) -> bool:
        return any(marker in goal for marker in ("完成", "开发", "实现", "搭建", "制作", "程序", "联调", "项目"))

    @staticmethod
    def _is_learning_goal(goal: str) -> bool:
        return any(marker in goal for marker in ("学会", "学习", "练习", "掌握"))

    @staticmethod
    def _timebox_minutes(constraints: str) -> int:
        matches = re.findall(r"(\d+(?:\.\d+)?)\s*(小时|时|分钟|min)", constraints, flags=re.IGNORECASE)
        if not matches:
            return 45
        values = [
            round(float(value) * 60) if unit in {"小时", "时"} else round(float(value)) for value, unit in matches
        ]
        return max(5, min(45, min(values)))

    @staticmethod
    def _schedule_phrase(constraints: str) -> str:
        if "周日不能" in constraints:
            return "下一个非周日的可用时段"
        if "周末" in constraints:
            return "下一个周末可用时段"
        if "每天" in constraints or "平日" in constraints:
            return "下一次日常可用时段"
        return "下一次可用时段"

    @staticmethod
    def _clean(value: str, default: str) -> str:
        cleaned = " ".join(value.strip().split())
        return (cleaned or default)[:1000]
