import { describe, expect, it } from 'vitest'

import type {
  ActiveThread,
  ApiErrorState,
  CorrectionTarget,
  DemoSessionState,
  PlanVersion,
  RequestScope,
  SystemSnapshot,
  ThreadAggregateState,
} from '../types'
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

function acceptedPlan(): PlanVersion {
  return {
    id: 'plan-v2',
    rootPlanId: 'plan-v1',
    previousPlanId: 'plan-v1',
    version: 2,
    status: 'accepted',
    mainGoal: 'Complete the workflow',
    maintenanceGoals: [],
    pausedGoals: [],
    removedItems: [],
    stage: 'Execution',
    singleAction: 'Run the acceptance test',
    completionStandard: 'The test passes',
    reviewCondition: 'Review after feedback',
    workload: 'medium',
    systemRecommendation: 'Keep the accepted plan active',
    isUserFinalChoice: false,
    acceptedAt: '2026-07-14T01:00:00Z',
    createdAt: '2026-07-14T00:00:00Z',
    updatedAt: '2026-07-14T01:00:00Z',
  }
}

function activeThread(currentStep: ActiveThread['currentStep']): ActiveThread {
  return {
    id: 'thread-1',
    userId: 'test-user',
    title: 'Workflow state test',
    status: 'active',
    currentStep,
    phase: 'Execution',
    activeUnderstandingSessionId: 'understanding-1',
    activePlanId: 'plan-v2',
    lastActivityAt: '2026-07-14T01:00:00Z',
    createdAt: '2026-07-14T00:00:00Z',
    updatedAt: '2026-07-14T01:00:00Z',
  }
}

function requestScope(threadId = 'thread-1', generation = 1): RequestScope {
  return { userId: 'test-user', threadId, generation }
}

function threadAggregate(serverStep: ThreadAggregateState['serverStep']): ThreadAggregateState {
  const plan = acceptedPlan()
  return {
    thread: activeThread(serverStep),
    serverStep,
    activeUnderstandingSession: null,
    expressionMode: null,
    userInput: '',
    answers: {},
    answerMeta: {},
    currentQuestionIndex: 3,
    currentQuestion: null,
    understanding: null,
    corrections: [],
    currentPlan: plan,
    planVersions: [plan],
    latestActionResult: null,
    systemRevision: null,
    snapshot: snapshot('snapshot-v2', 2),
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
      activeThread: activeThread('system_revised'),
      activeThreadId: 'thread-1',
      activeThreadGeneration: 1,
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
      scope: requestScope(),
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

describe('plan workflow monotonicity', () => {
  it('does not let an earlier aggregate server step overwrite a later step for the same thread', () => {
    const thread = activeThread('system_revised')
    const state: DemoSessionState = {
      ...createInitialSession(),
      activeThreadId: thread.id,
      activeThread: thread,
      activeThreadGeneration: 1,
      currentStep: 'system_revised',
      serverStep: 'system_revised',
      currentPlan: acceptedPlan(),
      activePlanId: 'plan-v2',
      planSource: 'api',
      dataSource: 'api',
      isOfflineCache: false,
    }

    const next = interactionReducer(state, {
      type: 'THREAD_AGGREGATE_LOADED',
      aggregate: threadAggregate('action_pending'),
      scope: requestScope(),
    })

    expect(next.serverStep).toBe('system_revised')
    expect(next.currentStep).toBe('system_revised')
    expect(next.activeThread?.currentStep).toBe('system_revised')
  })

  it('lets a fresh aggregate replace a later step restored only from offline cache', () => {
    const thread = activeThread('system_revised')
    const state: DemoSessionState = {
      ...createInitialSession(),
      activeThreadId: thread.id,
      activeThread: thread,
      activeThreadGeneration: 1,
      currentStep: 'system_revised',
      serverStep: 'system_revised',
      dataSource: 'cache',
      isOfflineCache: true,
    }

    const next = interactionReducer(state, {
      type: 'THREAD_AGGREGATE_LOADED',
      aggregate: threadAggregate('action_pending'),
      scope: requestScope(),
    })

    expect(next.serverStep).toBe('action_pending')
    expect(next.currentStep).toBe('action_pending')
    expect(next.dataSource).toBe('api')
  })

  it('treats an older repeated accept response as recovery without regressing accepted state', () => {
    const plan = acceptedPlan()
    const revisedSnapshot = snapshot('snapshot-v3', 3)
    const state: DemoSessionState = {
      ...createInitialSession(),
      activeThread: activeThread('action_pending'),
      activeThreadId: 'thread-1',
      activeThreadGeneration: 1,
      currentStep: 'action_pending',
      serverStep: 'action_pending',
      currentPlan: plan,
      planVersions: [plan],
      activePlanId: plan.id,
      planSource: 'api',
      serverSnapshot: revisedSnapshot,
      latestSnapshot: revisedSnapshot,
      systemSnapshot: revisedSnapshot,
    }

    const next = interactionReducer(state, {
      type: 'PLAN_ACCEPT_SUCCEEDED',
      result: {
        plan,
        snapshot: snapshot('snapshot-v2', 2),
        currentStep: 'plan_accepted',
      },
      scope: requestScope(),
    })

    expect(next.serverStep).toBe('action_pending')
    expect(next.currentStep).toBe('action_pending')
    expect(next.currentPlan?.acceptedAt).toBe(plan.acceptedAt)
    expect(next.latestSnapshot?.id).toBe(revisedSnapshot.id)
    expect(next.snapshotVersion).toBe(revisedSnapshot.version)
  })

  it('keeps UI and server steps unchanged when accept fails with INVALID_FLOW_STATE', () => {
    const state: DemoSessionState = {
      ...createInitialSession(),
      currentStep: 'plan_modified',
      serverStep: 'plan_modified',
      planRequestStatus: 'loading',
    }
    const error: ApiErrorState = {
      code: 'INVALID_FLOW_STATE',
      message: 'The plan is no longer active.',
      status: 409,
      requestId: 'request-invalid-plan',
    }

    const next = interactionReducer(state, { type: 'PLAN_REQUEST_FAILED', error })

    expect(next.currentStep).toBe('plan_modified')
    expect(next.serverStep).toBe('plan_modified')
    expect(next.planRequestStatus).toBe('error')
    expect(next.planApiError?.code).toBe('INVALID_FLOW_STATE')
  })
})
