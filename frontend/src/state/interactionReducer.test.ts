import { describe, expect, it } from 'vitest'

import type { ApiErrorState, CorrectionTarget, DemoSessionState, SystemSnapshot } from '../types'
import { createInitialSession } from './initialState'
import { interactionReducer } from './interactionReducer'

function snapshot(id: string, version: number): SystemSnapshot {
  return {
    ...createInitialSession().systemSnapshot,
    id,
    userId: 'test-user',
    version,
    currentVector: version === 1 ? '旧主线' : '最新主线',
    createdAt: `2026-07-14T00:0${version}:00Z`,
    updatedAt: `2026-07-14T00:0${version}:00Z`,
  }
}

describe('correction stale snapshot recovery', () => {
  it('keeps the correction draft while replacing cached authority with the latest snapshot', () => {
    const snapshotV1 = snapshot('snapshot-v1', 1)
    const snapshotV2 = snapshot('snapshot-v2', 2)
    const targetV1: CorrectionTarget = {
      key: 'current-vector',
      targetType: 'system_section',
      targetId: 'vector',
      area: 'vector',
      label: '当前主线',
      originalValue: snapshotV1.currentVector,
      snapshotId: snapshotV1.id!,
      snapshotVersion: snapshotV1.version,
    }
    const staleError: ApiErrorState = {
      code: 'STALE_SNAPSHOT',
      message: '系统状态已经更新，请检查最新内容后重新提交。',
      status: 409,
      requestId: 'request-stale',
    }
    let state: DemoSessionState = {
      ...createInitialSession(),
      serverSnapshot: snapshotV1,
      latestSnapshot: snapshotV1,
      systemSnapshot: snapshotV1,
      dataSource: 'api' as const,
    }

    state = interactionReducer(state, { type: 'OPEN_CORRECTION_TARGET', target: targetV1 })
    state = interactionReducer(state, { type: 'UPDATE_CORRECTION_TYPE', correctionType: 'partial' })
    state = interactionReducer(state, { type: 'UPDATE_CORRECTION_DRAFT', value: '保留这段修正草稿' })
    state = interactionReducer(state, { type: 'UPDATE_CORRECTION_REASON', value: '基于当时看到的状态' })
    state = interactionReducer(state, { type: 'CORRECTION_REQUEST_STARTED' })
    state = interactionReducer(state, {
      type: 'CORRECTION_STALE_SNAPSHOT_REFRESHED',
      snapshot: snapshotV2,
      error: staleError,
    })

    expect(state.latestSnapshot?.id).toBe(snapshotV2.id)
    expect(state.correctionDraft).toBe('保留这段修正草稿')
    expect(state.correctionReason).toBe('基于当时看到的状态')
    expect(state.correctionType).toBe('partial')
    expect(state.correctionApiError?.code).toBe('STALE_SNAPSHOT')
    expect(state.activeCorrectionTarget?.snapshotId).toBe(snapshotV1.id)

    const targetV2 = {
      ...targetV1,
      originalValue: snapshotV2.currentVector,
      snapshotId: snapshotV2.id!,
      snapshotVersion: snapshotV2.version,
    }
    state = interactionReducer(state, { type: 'OPEN_CORRECTION_TARGET', target: targetV2 })

    expect(state.activeCorrectionTarget?.snapshotId).toBe(snapshotV2.id)
    expect(state.correctionDraft).toBe('保留这段修正草稿')
    expect(state.correctionReason).toBe('基于当时看到的状态')
    expect(state.correctionType).toBe('partial')
    expect(state.correctionApiError).toBeNull()
  })
})
