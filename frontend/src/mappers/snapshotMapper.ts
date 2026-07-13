import type { SnapshotDto } from '../api/dto'
import type {
  EffectivePattern,
  HypothesisSummary,
  SnapshotChange,
  SnapshotChangeKind,
  SnapshotDiff,
  SystemSnapshot,
} from '../types'

function text(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function optionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function mapPattern(value: Record<string, unknown>): EffectivePattern {
  return {
    content: text(value.content, '未命名候选规律'),
    maturity: text(value.maturity, 'candidate'),
    confidence: optionalNumber(value.confidence),
    supportCount: optionalNumber(value.support_count),
  }
}

function mapHypothesis(value: Record<string, unknown>, snapshotId: string, index: number): HypothesisSummary {
  return {
    id: text(value.id, `${snapshotId}-hypothesis-${index}`),
    content: text(value.content, '仍待补充的系统判断'),
    status: text(value.status, 'pending'),
    confidence: optionalNumber(value.confidence),
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

const rejectedStatuses = new Set(['denied', 'rejected', 'expired'])
const weakenedStatuses = new Set(['weakened', 'pending'])

function hypothesisChangeKind(previous: HypothesisSummary, current: HypothesisSummary): SnapshotChangeKind {
  if (rejectedStatuses.has(current.status)) return 'rejected'
  if (
    weakenedStatuses.has(current.status) && previous.status !== current.status
    || current.confidence !== null
      && current.confidence !== undefined
      && previous.confidence !== null
      && previous.confidence !== undefined
      && current.confidence < previous.confidence
  ) return 'weakened'
  return 'modified'
}

function describeHypothesis(item: HypothesisSummary) {
  return item.confidence === null || item.confidence === undefined
    ? `${item.content} · ${item.status}`
    : `${item.content} · ${item.status} · confidence ${item.confidence}`
}

function describePattern(item: EffectivePattern) {
  const support = item.supportCount === null || item.supportCount === undefined
    ? ''
    : ` · evidence ${item.supportCount}`
  return `${item.content} · ${item.maturity}${support}`
}

export function createSnapshotDiff(
  previous: SystemSnapshot | null,
  current: SystemSnapshot,
): SnapshotDiff {
  if (!previous) {
    return {
      fromSnapshotId: null,
      toSnapshotId: current.id,
      fromVersion: null,
      toVersion: current.version,
      hasChanges: false,
      isComparable: false,
      changes: [],
    }
  }

  const changes: SnapshotChange[] = []
  const add = (change: SnapshotChange) => changes.push(change)
  const focusBefore = `${previous.currentVector} · ${previous.currentStage}`
  const focusAfter = `${current.currentVector} · ${current.currentStage}`
  add({
    id: 'focus',
    kind: focusBefore === focusAfter ? 'retained' : 'modified',
    area: 'focus',
    label: '当前主线',
    before: focusBefore,
    after: focusAfter,
  })
  add({
    id: 'action',
    kind: previous.currentAction === current.currentAction ? 'retained' : 'modified',
    area: 'action',
    label: '下一次唯一行动',
    before: previous.currentAction,
    after: current.currentAction,
  })

  const previousHypotheses = new Map(previous.hypotheses.map((item) => [item.id, item]))
  const currentHypothesisIds = new Set(current.hypotheses.map((item) => item.id))
  current.hypotheses.forEach((item) => {
    const before = previousHypotheses.get(item.id)
    add({
      id: `hypothesis-${item.id}`,
      kind: !before
        ? 'added'
        : before.status === item.status && before.confidence === item.confidence
          ? 'retained'
          : hypothesisChangeKind(before, item),
      area: 'hypothesis',
      label: '系统判断',
      before: before ? describeHypothesis(before) : null,
      after: describeHypothesis(item),
    })
  })
  previous.hypotheses
    .filter((item) => !currentHypothesisIds.has(item.id))
    .forEach((item) => add({
      id: `hypothesis-${item.id}`,
      kind: 'rejected',
      area: 'hypothesis',
      label: '系统判断',
      before: describeHypothesis(item),
      after: null,
    }))

  const previousPatterns = new Map(previous.effectivePatterns.map((item) => [item.content, item]))
  const currentPatternIds = new Set(current.effectivePatterns.map((item) => item.content))
  current.effectivePatterns.forEach((item) => {
    const before = previousPatterns.get(item.content)
    const unchanged = before
      && before.maturity === item.maturity
      && before.confidence === item.confidence
      && before.supportCount === item.supportCount
    add({
      id: `pattern-${item.content}`,
      kind: !before ? 'added' : unchanged ? 'retained' : 'modified',
      area: 'pattern',
      label: '有效规律',
      before: before ? describePattern(before) : null,
      after: describePattern(item),
    })
  })
  previous.effectivePatterns
    .filter((item) => !currentPatternIds.has(item.content))
    .forEach((item) => add({
      id: `pattern-${item.content}`,
      kind: 'weakened',
      area: 'pattern',
      label: '有效规律',
      before: describePattern(item),
      after: null,
    }))

  const previousBoundaries = new Set(previous.realityBoundaries)
  const currentBoundaries = new Set(current.realityBoundaries)
  current.realityBoundaries.forEach((boundary) => add({
    id: `boundary-${boundary}`,
    kind: previousBoundaries.has(boundary) ? 'retained' : 'added',
    area: 'boundary',
    label: '现实边界',
    before: previousBoundaries.has(boundary) ? boundary : null,
    after: boundary,
  }))
  previous.realityBoundaries
    .filter((boundary) => !currentBoundaries.has(boundary))
    .forEach((boundary) => add({
      id: `boundary-${boundary}`,
      kind: 'weakened',
      area: 'boundary',
      label: '现实边界',
      before: boundary,
      after: null,
    }))

  return {
    fromSnapshotId: previous.id,
    toSnapshotId: current.id,
    fromVersion: previous.version,
    toVersion: current.version,
    hasChanges: changes.some((item) => item.kind !== 'retained'),
    isComparable: true,
    changes,
  }
}
