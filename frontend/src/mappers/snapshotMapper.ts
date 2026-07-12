import type { SnapshotDto } from '../api/dto'
import type { EffectivePattern, HypothesisSummary, SystemSnapshot } from '../types'

function text(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function mapPattern(value: Record<string, unknown>): EffectivePattern {
  return {
    content: text(value.content, '未命名候选规律'),
    maturity: text(value.maturity, 'candidate'),
  }
}

function mapHypothesis(value: Record<string, unknown>, snapshotId: string, index: number): HypothesisSummary {
  return {
    id: text(value.id, `${snapshotId}-hypothesis-${index}`),
    content: text(value.content, '仍待补充的系统判断'),
    status: text(value.status, 'pending'),
  }
}

export function snapshotMapper(dto: SnapshotDto): SystemSnapshot {
  return {
    id: dto.id,
    userId: dto.user_id,
    version: dto.version,
    sourceThreadId: dto.source_thread_id,
    sourceActionResultId: dto.source_action_result_id,
    currentVector: dto.current_vector,
    currentStage: dto.current_stage,
    currentAction: dto.current_action,
    realityBoundaries: [...dto.reality_boundaries],
    effectivePatterns: dto.effective_patterns.map(mapPattern),
    hypotheses: dto.hypotheses.map((item, index) => mapHypothesis(item, dto.id, index)),
    recentRevisions: [...dto.recent_revisions],
    userCorrections: [...dto.user_corrections],
    revisionCount: dto.revision_count,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  }
}
