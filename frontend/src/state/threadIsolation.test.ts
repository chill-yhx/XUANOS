import { describe, expect, it } from 'vitest'

import { understandingQuestionAt } from '../data/understandingQuestions'
import type {
  ActiveThread,
  DemoSessionState,
  PlanVersion,
  RequestScope,
  SystemSnapshot,
  ThreadAggregateState,
  UnderstandingSession,
  UnderstandingSummary,
} from '../types'
import { createInitialSession } from './initialState'
import { interactionReducer } from './interactionReducer'

const userId = 'test-user'

function scope(threadId: string, generation: number): RequestScope {
  return { userId, threadId, generation }
}

function thread(
  id: string,
  currentStep: ActiveThread['currentStep'] = 'idle',
  activePlanId: string | null = null,
  sessionId: string | null = null,
): ActiveThread {
  return {
    id,
    userId,
    title: `Thread ${id}`,
    status: 'active',
    currentStep,
    phase: 'Calibration',
    activeUnderstandingSessionId: sessionId,
    activePlanId,
    lastActivityAt: '2026-07-14T01:00:00Z',
    createdAt: '2026-07-14T00:00:00Z',
    updatedAt: '2026-07-14T01:00:00Z',
  }
}

function snapshot(threadId: string, version = 1): SystemSnapshot {
  return {
    ...createInitialSession().systemSnapshot,
    id: `snapshot-${threadId}-${version}`,
    userId,
    version,
    sourceThreadId: threadId,
    currentVector: `Focus for ${threadId}`,
    createdAt: '2026-07-14T01:00:00Z',
    updatedAt: '2026-07-14T01:00:00Z',
  }
}

function plan(threadId: string): PlanVersion {
  return {
    id: `plan-${threadId}`,
    threadId,
    version: 1,
    status: 'accepted',
    mainGoal: `Goal for ${threadId}`,
    maintenanceGoals: [],
    pausedGoals: [],
    removedItems: [],
    stage: 'Execution',
    singleAction: `Action for ${threadId}`,
    completionStandard: 'Complete',
    reviewCondition: 'After action',
    workload: 'small',
    systemRecommendation: 'Proceed',
    isUserFinalChoice: false,
    acceptedAt: '2026-07-14T01:00:00Z',
    createdAt: '2026-07-14T00:30:00Z',
    updatedAt: '2026-07-14T01:00:00Z',
  }
}

function session(
  threadId: string,
  status: UnderstandingSession['status'],
  currentQuestionIndex: number,
): UnderstandingSession {
  return {
    id: `session-${threadId}`,
    threadId,
    userId,
    previousSessionId: null,
    expressionMode: 'sort',
    status,
    userInput: `Input for ${threadId}`,
    currentQuestionIndex,
    summaryVersion: status === 'reviewing' || status === 'confirmed' ? 1 : 0,
    confirmedAt: status === 'confirmed' ? '2026-07-14T01:00:00Z' : null,
    createdAt: '2026-07-14T00:00:00Z',
    updatedAt: '2026-07-14T01:00:00Z',
  }
}

const summary: UnderstandingSummary = {
  realGoal: 'Ship the MVP',
  foundation: 'Prototype exists',
  constraints: 'Limited time',
  tension: 'Planning versus execution',
  uncertain: 'Sustainable pace',
}

function aggregate(
  threadId: string,
  options: {
    step?: ActiveThread['currentStep']
    session?: UnderstandingSession | null
    answers?: ThreadAggregateState['answers']
    understanding?: UnderstandingSummary | null
    currentPlan?: PlanVersion | null
  } = {},
): ThreadAggregateState {
  const activeSession = options.session ?? null
  const currentPlan = options.currentPlan ?? null
  const step = options.step ?? 'idle'
  return {
    thread: thread(threadId, step, currentPlan?.id ?? null, activeSession?.id ?? null),
    serverStep: step,
    activeUnderstandingSession: activeSession,
    expressionMode: activeSession?.expressionMode ?? null,
    userInput: activeSession?.userInput ?? '',
    answers: options.answers ?? {},
    answerMeta: {},
    currentQuestionIndex: activeSession?.currentQuestionIndex ?? 0,
    currentQuestion: activeSession?.status === 'collecting'
      ? understandingQuestionAt(activeSession.currentQuestionIndex)
      : null,
    understanding: options.understanding ?? null,
    corrections: [],
    currentPlan,
    planVersions: currentPlan ? [currentPlan] : [],
    latestActionResult: null,
    systemRevision: null,
    snapshot: snapshot(threadId),
  }
}

function activeState(threadId: string, generation: number): DemoSessionState {
  const active = thread(threadId)
  return {
    ...createInitialSession(),
    activeThreadGeneration: generation,
    activeThread: active,
    activeThreadId: threadId,
    availableThreads: [active],
    dataSource: 'api',
  }
}

describe('thread-scoped state', () => {
  it('clears plan, feedback, correction, snapshot comparison, and request state before loading another thread', () => {
    const threadA = thread('a', 'action_pending', 'plan-a')
    const threadB = thread('b')
    const planA = plan('a')
    const stateA: DemoSessionState = {
      ...activeState('a', 1),
      activeThread: threadA,
      availableThreads: [threadA, threadB],
      currentPlan: planA,
      planVersions: [planA],
      activePlanId: planA.id,
      lastViewedPlanId: planA.id,
      actionFeedback: {
        ...createInitialSession().actionFeedback,
        planId: planA.id,
        userNote: 'A-only feedback draft',
      },
      correctionDraft: 'A-only correction',
      previousSnapshot: snapshot('a', 1),
      snapshotDiff: {
        fromSnapshotId: 'snapshot-a-1',
        toSnapshotId: 'snapshot-a-2',
        fromVersion: 1,
        toVersion: 2,
        hasChanges: false,
        isComparable: true,
        changes: [],
      },
      planRequestStatus: 'error',
      planApiError: { code: 'SERVER_ERROR', message: 'A error', status: 500, requestId: null },
      isOfflineCache: true,
    }

    const switching = interactionReducer(stateA, {
      type: 'THREAD_SWITCH_STARTED',
      thread: threadB,
      generation: 2,
    })

    expect(switching.activeThreadId).toBe('b')
    expect(switching.currentPlan).toBeNull()
    expect(switching.planVersions).toEqual([])
    expect(switching.actionFeedback.userNote).toBe('')
    expect(switching.correctionDraft).toBe('')
    expect(switching.previousSnapshot).toBeNull()
    expect(switching.snapshotDiff).toBeNull()
    expect(switching.planRequestStatus).toBe('idle')
    expect(switching.planApiError).toBeNull()
    expect(switching.isOfflineCache).toBe(false)

    const loaded = interactionReducer(switching, {
      type: 'THREAD_AGGREGATE_LOADED',
      aggregate: aggregate('b'),
      scope: scope('b', 2),
    })
    expect(loaded.currentPlan).toBeNull()
    expect(loaded.activePlanId).toBeNull()
  })

  it('ignores a delayed response from the previously active thread', () => {
    const threadB = thread('b')
    const switching = interactionReducer(activeState('a', 1), {
      type: 'THREAD_SWITCH_STARTED',
      thread: threadB,
      generation: 2,
    })

    const afterLateResponse = interactionReducer(switching, {
      type: 'THREAD_AGGREGATE_LOADED',
      aggregate: aggregate('a', { currentPlan: plan('a'), step: 'action_pending' }),
      scope: scope('a', 1),
    })

    expect(afterLateResponse).toBe(switching)
    expect(afterLateResponse.activeThreadId).toBe('b')
    expect(afterLateResponse.currentPlan).toBeNull()
  })

  it('restores only the matching thread draft when switching back', () => {
    const planA = plan('a')
    const cachedA: DemoSessionState = {
      ...activeState('a', 1),
      activePlanId: planA.id,
      currentPlan: planA,
      planVersions: [planA],
      actionFeedback: {
        ...createInitialSession().actionFeedback,
        planId: planA.id,
        userNote: 'A draft restored',
      },
    }
    const started = interactionReducer(activeState('b', 2), {
      type: 'THREAD_SWITCH_STARTED',
      thread: thread('a', 'action_pending', planA.id),
      generation: 3,
    })
    const loaded = interactionReducer(started, {
      type: 'THREAD_AGGREGATE_LOADED',
      aggregate: aggregate('a', { currentPlan: planA, step: 'action_pending' }),
      scope: scope('a', 3),
    })
    const restored = interactionReducer(loaded, {
      type: 'THREAD_DRAFT_RESTORED',
      cachedState: cachedA,
      scope: scope('a', 3),
    })

    expect(restored.actionFeedback.userNote).toBe('A draft restored')
    expect(restored.actionFeedback.planId).toBe(planA.id)
  })
})

describe('idle and early understanding recovery', () => {
  function loadAggregate(value: ThreadAggregateState) {
    const started = interactionReducer(activeState(value.thread.id, 0), {
      type: 'THREAD_SWITCH_STARTED',
      thread: value.thread,
      generation: 1,
    })
    return interactionReducer(started, {
      type: 'THREAD_AGGREGATE_LOADED',
      aggregate: value,
      scope: scope(value.thread.id, 1),
    })
  }

  it('restores a thread without an understanding session to expression mode', () => {
    const state = loadAggregate(aggregate('idle'))
    expect(state.serverStep).toBe('idle')
    expect(state.currentStep).toBe('expression_mode')
    expect(state.understandingSessionId).toBeNull()
  })

  it('restores one submitted answer at the second question', () => {
    const activeSession = session('partial', 'collecting', 1)
    const state = loadAggregate(aggregate('partial', {
      step: 'asking_question',
      session: activeSession,
      answers: { desired_result: 'Ship the MVP' },
    }))

    expect(state.currentStep).toBe('asking_question')
    expect(state.currentQuestionIndex).toBe(1)
    expect(state.currentQuestion?.id).toBe('current_foundation')
    expect(state.submittedAnswers.desired_result).toBe('Ship the MVP')
  })

  it('restores an unconfirmed summary to understanding review', () => {
    const state = loadAggregate(aggregate('review', {
      step: 'reviewing_understanding',
      session: session('review', 'reviewing', 3),
      understanding: summary,
    }))

    expect(state.currentStep).toBe('reviewing_understanding')
    expect(state.serverUnderstanding).toEqual(summary)
    expect(state.understandingConfirmedAt).toBeNull()
  })

  it('does not regress a confirmed understanding even if the stored thread step is idle', () => {
    const state = loadAggregate(aggregate('confirmed', {
      step: 'idle',
      session: session('confirmed', 'confirmed', 3),
      understanding: summary,
    }))

    expect(state.serverStep).toBe('understanding_confirmed')
    expect(state.currentStep).toBe('understanding_confirmed')
    expect(state.understandingConfirmedAt).not.toBeNull()
  })
})
