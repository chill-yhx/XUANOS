from dataclasses import dataclass


@dataclass(frozen=True)
class CorrectionDecision:
    snapshot_required: bool
    system_handling: str
    recent_revision: str


CORRECTION_LABELS = {
    "accurate": "准确",
    "partial": "部分准确",
    "inaccurate": "不准确",
    "changed": "已经变化",
    "discontinue": "不希望继续使用",
}


def decide_correction(correction_type: str, target_type: str) -> CorrectionDecision:
    """Apply the product's append-only correction policy."""

    label = CORRECTION_LABELS[correction_type]
    if correction_type == "accurate":
        return CorrectionDecision(
            snapshot_required=False,
            system_handling="已记录用户确认，保留当前系统快照。",
            recent_revision=f"用户确认 {target_type} 当前准确。",
        )
    if correction_type == "discontinue":
        handling = "已保留原始记录，并在新版本快照中停止继续采用该内容。"
    elif correction_type == "changed":
        handling = "已保留原始记录，并将变化后的内容写入新版本快照。"
    else:
        handling = "已保留原始记录，并将用户修正写入新版本快照。"
    return CorrectionDecision(
        snapshot_required=True,
        system_handling=handling,
        recent_revision=f"用户将 {target_type} 标记为“{label}”。",
    )
