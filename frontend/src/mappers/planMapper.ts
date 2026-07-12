import type { PlanDto, PlanItemDto } from '../api/dto'
import type { PlanItem, PlanModificationReason, PlanVersion } from '../types'

const reasons = new Set<PlanModificationReason>([
  'time_conflict',
  'resource_limit',
  'ability_limit',
  'health_or_safety',
  'personal_preference',
  'reject_system_judgment',
  'other',
])

function planItemMapper(dto: PlanItemDto): PlanItem {
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
