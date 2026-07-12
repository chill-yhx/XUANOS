import type { ActionResultDto } from '../api/dto'
import type { ActionResult, SystemRevision } from '../types'

export function actionResultMapper(dto: ActionResultDto): ActionResult {
  return {
    id: dto.id,
    threadId: dto.thread_id,
    planId: dto.plan_id,
    started: dto.started,
    completed: dto.completed,
    progressPercent: dto.progress_percent,
    actualDurationMinutes: dto.actual_duration_minutes,
    obstacleCode: dto.obstacle_code,
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
