import type {
  PlanAcceptRequestDto,
  PlanAcceptResultDto,
  PlanCreateRequestDto,
  PlanCreateResultDto,
  PlanDto,
  PlanItemDto,
  PlanReviseRequestDto,
  PlanReviseResultDto,
} from '../api/dto'
import type {
  InteractionStep,
  PlanAcceptResult,
  PlanCreateResult,
  PlanItem,
  PlanModificationReason,
  PlanReviseResult,
  PlanVersion,
} from '../types'
import { snapshotMapper } from './snapshotMapper'

const reasons = new Set<PlanModificationReason>([
  'time_conflict',
  'resource_limit',
  'ability_limit',
  'health_or_safety',
  'personal_preference',
  'reject_system_judgment',
  'other',
])

const planSteps = new Set<InteractionStep>([
  'plan_generated',
  'plan_modified',
  'plan_accepted',
  'action_pending',
  'feedback_submitted',
  'system_revised',
])

function planStepMapper(value: string, fallback: InteractionStep): InteractionStep {
  return planSteps.has(value as InteractionStep) ? value as InteractionStep : fallback
}

export function planItemMapper(dto: PlanItemDto): PlanItem {
  return {
    id: dto.id,
    itemType: dto.item_type,
    title: dto.title,
    timeBlock: dto.time_block,
    estimatedMinutes: dto.estimated_minutes,
    difficulty: dto.difficulty,
    completionStandard: dto.completion_standard,
    isOptional: dto.is_optional,
    source: dto.source,
    isUserModified: dto.is_user_modified,
    modificationNote: dto.modification_note,
    sortOrder: dto.sort_order,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  }
}

export function planMapper(dto: PlanDto, mainGoal: string): PlanVersion {
  const items = dto.items.map(planItemMapper)
  const status = ['generated', 'accepted', 'superseded', 'cancelled'].includes(dto.status)
    ? dto.status as PlanVersion['status']
    : 'generated'
  const modificationReason = reasons.has(dto.modification_reason as PlanModificationReason)
    ? dto.modification_reason as PlanModificationReason
    : undefined

  return {
    id: dto.id,
    threadId: dto.thread_id,
    rootPlanId: dto.root_plan_id,
    previousPlanId: dto.previous_plan_id,
    understandingSessionId: dto.understanding_session_id,
    primaryGoalId: dto.primary_goal_id,
    version: dto.version,
    status,
    mainGoal,
    summary: dto.summary,
    maintenanceGoals: items.filter((item) => item.itemType === 'maintenance').map((item) => item.title),
    pausedGoals: items.filter((item) => item.itemType === 'paused').map((item) => item.title),
    removedItems: items.filter((item) => item.itemType === 'removed').map((item) => item.title),
    items,
    stage: dto.stage,
    singleAction: dto.single_action,
    completionStandard: dto.completion_standard,
    reviewCondition: dto.review_condition,
    workload: dto.workload,
    systemRecommendation: dto.system_recommendation,
    userFinalChoice: dto.user_final_choice ?? undefined,
    modificationReason,
    expectedImpact: dto.expected_impact ?? undefined,
    warningLevel: dto.warning_level,
    isUserFinalChoice: dto.is_user_final_choice,
    acceptedAt: dto.accepted_at,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  }
}

export interface CreatePlanInput {
  threadId: string
  understandingSessionId: string
  mainGoal: string
}

export interface RevisePlanInput {
  threadId: string
  plan: PlanVersion
  reason: PlanModificationReason
  userChoice: string
  expectedImpactAcknowledged: boolean
  mainGoal: string
}

export interface AcceptPlanInput {
  threadId: string
  plan: PlanVersion
  mainGoal: string
}

export function toPlanCreateRequest(input: CreatePlanInput): PlanCreateRequestDto {
  return {
    thread_id: input.threadId,
    understanding_session_id: input.understandingSessionId,
  }
}

export function fromPlanCreateResult(
  dto: PlanCreateResultDto,
  mainGoal: string,
): PlanCreateResult {
  return {
    plan: planMapper(dto.plan, mainGoal),
    currentStep: planStepMapper(dto.current_step, 'plan_generated'),
  }
}

export function toPlanReviseRequest(input: RevisePlanInput): PlanReviseRequestDto {
  return {
    reason: input.reason,
    user_final_choice: input.userChoice.trim(),
    expected_impact_acknowledged: input.expectedImpactAcknowledged,
    expected_version: input.plan.version,
  }
}

export function fromPlanReviseResult(
  dto: PlanReviseResultDto,
  mainGoal: string,
): PlanReviseResult {
  return {
    previousPlan: planMapper(dto.previous_plan, mainGoal),
    currentPlan: planMapper(dto.current_plan, mainGoal),
    currentStep: planStepMapper(dto.current_step, 'plan_modified'),
  }
}

export function toPlanAcceptRequest(input: AcceptPlanInput): PlanAcceptRequestDto {
  return { expected_version: input.plan.version }
}

export function fromPlanAcceptResult(
  dto: PlanAcceptResultDto,
  mainGoal: string,
): PlanAcceptResult {
  return {
    plan: planMapper(dto.plan, mainGoal),
    snapshot: snapshotMapper(dto.snapshot),
    currentStep: planStepMapper(dto.current_step, 'plan_accepted'),
  }
}
