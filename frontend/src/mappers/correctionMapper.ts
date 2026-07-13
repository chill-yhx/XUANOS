import { ApiError } from '../api/apiErrors'
import type { UserCorrectionCreateDto, UserCorrectionDto } from '../api/dto'
import type {
  CorrectionRecord,
  CorrectionTarget,
  CorrectionTargetType,
  CorrectionType,
  PlanVersion,
  SystemSnapshot,
  UserCorrectionResult,
} from '../types'
import { createSnapshotDiff } from './snapshotMapper'

const correctionTypes = new Set<CorrectionType>([
  'accurate',
  'partial',
  'inaccurate',
  'changed',
  'discontinue',
])

const correctionTargetTypes = new Set<CorrectionTargetType>([
  'understanding',
  'goal',
  'constraint',
  'plan',
  'snapshot',
  'hypothesis',
  'system_section',
])

const fallbackReasons: Record<CorrectionType, string> = {
  accurate: '用户确认当前判断准确。',
  partial: '用户补充了更准确的表述。',
  inaccurate: '用户指出当前判断不准确。',
  changed: '用户说明现实情况已经变化。',
  discontinue: '用户要求系统停止使用该判断。',
}

export interface SubmitCorrectionInput {
  target: CorrectionTarget
  correctionType: CorrectionType
  correctedValue: string
  reason: string
  previousSnapshot: SystemSnapshot
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError(`纠正响应缺少 ${field}。`, { code: 'INVALID_API_RESPONSE' })
  }
  return value
}

function correctionTypeFromDto(value: string): CorrectionType {
  if (!correctionTypes.has(value as CorrectionType)) {
    throw new ApiError('纠正响应包含未知类型。', { code: 'INVALID_API_RESPONSE' })
  }
  return value as CorrectionType
}

function targetTypeFromDto(value: string): CorrectionTargetType {
  if (!correctionTargetTypes.has(value as CorrectionTargetType)) {
    throw new ApiError('纠正响应包含未知目标类型。', { code: 'INVALID_API_RESPONSE' })
  }
  return value as CorrectionTargetType
}

export function toCorrectionRequest(input: SubmitCorrectionInput): UserCorrectionCreateDto {
  const originalValue = input.target.originalValue.trim()
  const correctedValue = input.correctedValue.trim()
  if (!input.previousSnapshot.id) {
    throw new ApiError('当前纠正缺少服务端快照版本。', {
      code: 'VALIDATION_ERROR',
      status: 422,
    })
  }
  if (!originalValue) {
    throw new ApiError('当前纠正目标没有可提交的内容。', {
      code: 'VALIDATION_ERROR',
      status: 422,
    })
  }
  if (
    ['partial', 'inaccurate', 'changed'].includes(input.correctionType)
    && !correctedValue
  ) {
    throw new ApiError('请填写修正后的内容。', { code: 'VALIDATION_ERROR', status: 422 })
  }

  return {
    expected_snapshot_id: input.previousSnapshot.id,
    target_type: input.target.targetType,
    target_id: input.target.targetId,
    correction_type: input.correctionType,
    original_value: originalValue,
    corrected_value: correctedValue || originalValue,
    reason: input.reason.trim() || fallbackReasons[input.correctionType],
  }
}

export function userCorrectionMapper(dto: UserCorrectionDto): CorrectionRecord {
  return {
    id: requiredText(dto.id, 'correction.id'),
    userId: requiredText(dto.user_id, 'correction.user_id'),
    threadId: dto.thread_id,
    target: dto.target_type,
    targetType: targetTypeFromDto(dto.target_type),
    targetId: dto.target_id,
    assessment: correctionTypeFromDto(dto.correction_type),
    previousValue: requiredText(dto.original_value, 'correction.original_value'),
    userValue: requiredText(dto.corrected_value, 'correction.corrected_value'),
    reason: dto.reason,
    systemHandling: dto.system_handling,
    hasConflict: dto.has_conflict,
    createdAt: requiredText(dto.created_at, 'correction.created_at'),
    updatedAt: requiredText(dto.updated_at, 'correction.updated_at'),
  }
}

export function fromCorrectionResult(
  correctionDto: UserCorrectionDto,
  snapshot: SystemSnapshot,
  snapshotUpdated: boolean,
  input: SubmitCorrectionInput,
): UserCorrectionResult {
  return {
    correction: userCorrectionMapper(correctionDto),
    snapshot,
    snapshotUpdated,
    previousSnapshot: input.previousSnapshot,
    snapshotDiff: createSnapshotDiff(input.previousSnapshot, snapshot),
  }
}

function target(
  snapshot: SystemSnapshot,
  values: Omit<CorrectionTarget, 'snapshotId' | 'snapshotVersion'>,
): CorrectionTarget | null {
  if (!snapshot.id || !values.targetId || !values.originalValue.trim()) return null
  return {
    ...values,
    snapshotId: snapshot.id,
    snapshotVersion: snapshot.version,
  }
}

export function buildCorrectionTargets(
  snapshot: SystemSnapshot,
  currentPlan: PlanVersion | null,
): CorrectionTarget[] {
  if (!snapshot.id) return []

  const targets: Array<CorrectionTarget | null> = [
    target(snapshot, {
      key: 'current-vector',
      targetType: 'system_section',
      targetId: 'vector',
      area: 'vector',
      label: '当前主线',
      originalValue: snapshot.currentVector,
    }),
    target(snapshot, {
      key: 'current-action',
      targetType: currentPlan ? 'plan' : 'snapshot',
      targetId: currentPlan?.id ?? snapshot.id,
      area: 'action',
      label: '下一步唯一行动',
      originalValue: snapshot.currentAction,
    }),
    target(snapshot, {
      key: 'current-state',
      targetType: 'snapshot',
      targetId: snapshot.id,
      area: 'state',
      label: '当前阶段',
      originalValue: snapshot.currentStage,
    }),
    ...snapshot.realityBoundaries.map((value, index) => target(snapshot, {
      key: `boundary-${index}`,
      targetType: 'system_section',
      targetId: 'bounds',
      area: 'boundary',
      label: '现实边界',
      originalValue: value,
    })),
    ...snapshot.effectivePatterns.map((value, index) => target(snapshot, {
      key: `pattern-${index}`,
      targetType: 'system_section',
      targetId: 'working',
      area: 'pattern',
      label: '用户规律',
      originalValue: value.content,
    })),
    ...snapshot.hypotheses.map((value) => {
      const hasPersistedId = value.id.length <= 36 && !value.id.startsWith('correction-')
      return target(snapshot, {
        key: `hypothesis-${value.id}`,
        targetType: hasPersistedId ? 'hypothesis' : 'system_section',
        targetId: hasPersistedId ? value.id : 'review',
        area: 'hypothesis',
        label: '系统判断',
        originalValue: value.content,
      })
    }),
  ]

  return targets.filter((item): item is CorrectionTarget => item !== null)
}
