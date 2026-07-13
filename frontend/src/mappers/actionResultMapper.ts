import type {
  ActionHypothesisDto,
  ActionResultCreateDto,
  ActionResultDto,
  ActionSubmissionResultDto,
  SystemRevisionDto,
} from '../api/dto'
import type {
  ActionHypothesis,
  ActionResult,
  ActionResultStatus,
  ActionSubmissionResult,
  FeedbackPayload,
  InteractionStep,
  SystemRevision,
  SystemSnapshot,
} from '../types'
import { ApiError } from '../api/apiErrors'
import { createSnapshotDiff, snapshotMapper } from './snapshotMapper'

export interface SubmitActionResultInput {
  threadId: string
  planId: string
  planItemId: string | null
  actionIdentifier: string
  feedback: FeedbackPayload
  previousSnapshot: SystemSnapshot | null
}

function statusFromResult(dto: ActionResultDto): ActionResultStatus {
  if (dto.completed) return 'completed'
  if (!dto.started) return 'not_completed'
  return dto.progress_percent > 0 ? 'partially_completed' : 'abandoned'
}

function resultFlags(status: ActionResultStatus, progressPercent: number) {
  if (status === 'completed') return { started: true, completed: true, progressPercent: 100 }
  if (status === 'not_completed') return { started: false, completed: false, progressPercent: 0 }
  return { started: true, completed: false, progressPercent }
}

export function toActionResultRequest(input: SubmitActionResultInput): ActionResultCreateDto {
  const status = input.feedback.resultStatus
  if (!status || !input.feedback.obstacleCode) {
    throw new ApiError('行动反馈字段不完整。', { code: 'VALIDATION_ERROR', status: 422 })
  }
  const flags = resultFlags(status, input.feedback.progressPercent)
  return {
    thread_id: input.threadId,
    plan_id: input.planId,
    started: flags.started,
    completed: flags.completed,
    progress_percent: flags.progressPercent,
    actual_duration_minutes: input.feedback.actualDurationMinutes,
    obstacle_code: input.feedback.obstacleCode,
    obstacle_detail: input.feedback.userNote.trim() || null,
    energy_change: input.feedback.energyChange.trim() || null,
    unrealistic_part: input.feedback.unrealisticPart.trim() || null,
  }
}

export function actionResultMapper(
  dto: ActionResultDto,
  context?: {
    resultStatus?: ActionResultStatus
    planItemId?: string | null
    actionIdentifier?: string
  },
): ActionResult {
  return {
    id: dto.id,
    userId: dto.user_id,
    threadId: dto.thread_id,
    planId: dto.plan_id,
    planItemId: context?.planItemId ?? null,
    actionIdentifier: context?.actionIdentifier ?? dto.plan_id,
    resultStatus: context?.resultStatus ?? statusFromResult(dto),
    started: dto.started,
    completed: dto.completed,
    progressPercent: dto.progress_percent,
    actualDurationMinutes: dto.actual_duration_minutes,
    obstacleCode: dto.obstacle_code,
    userNote: dto.obstacle_detail,
    obstacleDetail: dto.obstacle_detail,
    energyChange: dto.energy_change,
    unrealisticPart: dto.unrealistic_part,
    originalJudgment: dto.original_judgment,
    actualResultSummary: dto.actual_result_summary,
    revisedJudgment: dto.revised_judgment,
    nextAdjustment: dto.next_adjustment,
    submittedAt: dto.submitted_at,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  }
}

export function systemRevisionMapper(dto: ActionResultDto): SystemRevision {
  return {
    originalJudgment: dto.original_judgment,
    actualResult: dto.actual_result_summary,
    revisedJudgment: dto.revised_judgment,
    nextAdjustment: dto.next_adjustment,
  }
}

function responseRevisionMapper(dto: SystemRevisionDto): SystemRevision {
  return {
    originalJudgment: dto.original_judgment,
    actualResult: dto.actual_result,
    revisedJudgment: dto.revised_judgment,
    nextAdjustment: dto.next_adjustment,
  }
}

function hypothesisMapper(dto: ActionHypothesisDto): ActionHypothesis {
  return {
    id: dto.id,
    content: dto.content,
    category: dto.category,
    status: dto.status,
    supportingEvidence: dto.supporting_evidence,
    opposingEvidence: dto.opposing_evidence,
    lastReviewedAt: dto.last_reviewed_at,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  }
}

function actionStep(value: string): InteractionStep {
  if (value !== 'system_revised') {
    throw new ApiError('行动反馈响应包含无效流程状态。', { code: 'INVALID_API_RESPONSE' })
  }
  return value
}

export function fromActionSubmissionResult(
  dto: ActionSubmissionResultDto,
  input: SubmitActionResultInput,
): ActionSubmissionResult {
  const snapshot = snapshotMapper(dto.snapshot)
  return {
    actionResult: actionResultMapper(dto.action_result, {
      resultStatus: input.feedback.resultStatus ?? undefined,
      planItemId: input.planItemId,
      actionIdentifier: input.actionIdentifier,
    }),
    systemRevision: responseRevisionMapper(dto.system_revision),
    hypothesis: hypothesisMapper(dto.hypothesis),
    snapshot,
    previousSnapshot: input.previousSnapshot,
    snapshotDiff: createSnapshotDiff(input.previousSnapshot, snapshot),
    currentStep: actionStep(dto.current_step),
  }
}
