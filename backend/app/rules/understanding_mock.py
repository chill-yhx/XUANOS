from dataclasses import dataclass


@dataclass(frozen=True)
class Question:
    id: str
    prompt: str
    hint: str


QUESTIONS = [
    Question("desired_result", "你最终想完成的具体结果是什么？", "描述一个可以判断是否完成的结果。"),
    Question("current_foundation", "你当前已经具备哪些基础？", "写下已有文档、能力、资源或已完成部分。"),
    Question("real_constraints", "现实中有哪些时间、资源或安排限制？", "只写真正影响执行的边界。"),
]
QUESTION_MAP = {question.id: question for question in QUESTIONS}


def generate_understanding(user_input: str | None, answers: dict[str, str]) -> dict[str, str]:
    return {
        "real_goal": answers.get("desired_result") or user_input or "完成 XUANOS 静态前端原型",
        "foundation": answers["current_foundation"],
        "constraints": answers["real_constraints"],
        "tension": "规格已经足够，主要矛盾是继续完善说明可能推迟真实开发。",
        "uncertain": "能否把当前判断转化为一次真实行动，仍需本轮反馈验证。",
    }
