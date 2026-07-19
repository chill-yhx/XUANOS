import { useCallback, useEffect, useReducer, useRef, type ReactNode } from 'react'
import { normalizeApiError, toApiErrorState, toCorrectionApiErrorState } from '../api/apiErrors'
import { AUTH_SESSION_INVALIDATED_EVENT, readAuthSession } from '../api/authSession'
import { clearIdempotencyStore } from '../api/idempotency'
import { submitActionResult as submitActionResultOnServer } from '../services/actionResultService'
import { ensureAuthSession } from '../services/authService'
import { submitUserCorrection } from '../services/correctionService'
import { getCurrentSnapshot } from '../services/snapshotService'
import {
  acceptPlan as acceptPlanOnServer,
  createPlan as createPlanOnServer,
  revisePlan as revisePlanOnServer,
} from '../services/planService'
import { createThread as createThreadOnServer, getThread, listThreads } from '../services/threadService'
import {
  analyzeUnderstanding,
  confirmUnderstanding as confirmUnderstandingOnServer,
} from '../services/understandingService'
import type {
  ApiErrorState,
  CorrectionType,
  ExpressionMode,
  InteractionStep,
  PageId,
  RequestScope,
  UnderstandingAssessment,
} from '../types'
import {
  clearIntegrationCache,
  readThreadIntegrationCache,
  restoreIntegrationState,
  writeIntegrationCache,
} from './integrationCache'
import { interactionReducer } from './interactionReducer'
import { InteractionContext } from './useInteraction'

function pageForStep(step: InteractionStep): PageId {
  if (
    ['expression_mode', 'collecting_input', 'asking_question', 'reviewing_understanding', 'understanding_confirmed']
      .includes(step)
  ) return 'understanding'
  if (['plan_generated', 'plan_modified', 'plan_accepted'].includes(step)) return 'plan'
  if (['action_pending', 'feedback_submitted'].includes(step)) return 'feedback'
  if (step === 'system_revised') return 'system'
  return 'home'
}

export function InteractionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(interactionReducer, undefined, restoreIntegrationState)
  const stateRef = useRef(state)
  const hydratedRef = useRef(false)
  const createThreadRequestRef = useRef<Promise<boolean> | null>(null)
  const snapshotRequestRef = useRef<Promise<void> | null>(null)
  const understandingRequestRef = useRef<Promise<boolean> | null>(null)
  const planRequestRef = useRef<Promise<boolean> | null>(null)
  const actionResultRequestRef = useRef<Promise<boolean> | null>(null)
  const correctionRequestRef = useRef<Promise<boolean> | null>(null)
  const activeThreadIdRef = useRef(state.activeThreadId)
  const threadGenerationRef = useRef(state.activeThreadGeneration)

  const nextThreadGeneration = () => {
    threadGenerationRef.current += 1
    return threadGenerationRef.current
  }

  const requestScope = (
    threadId = activeThreadIdRef.current,
    generation = threadGenerationRef.current,
  ): RequestScope | null => {
    const userId = readAuthSession()?.userId
    return userId && threadId ? { userId, threadId, generation } : null
  }

  const isRequestCurrent = (scope: RequestScope) => {
    return readAuthSession()?.userId === scope.userId
      && activeThreadIdRef.current === scope.threadId
      && threadGenerationRef.current === scope.generation
  }

  const clearThreadRequestRefs = () => {
    snapshotRequestRef.current = null
    understandingRequestRef.current = null
    planRequestRef.current = null
    actionResultRequestRef.current = null
    correctionRequestRef.current = null
  }

  useEffect(() => {
    stateRef.current = state
    activeThreadIdRef.current = state.activeThreadId
    threadGenerationRef.current = state.activeThreadGeneration
    writeIntegrationCache(state)
  }, [state])

  useEffect(() => {
    const handleInvalidSession = (event: Event) => {
      const eventUserId = (event as CustomEvent<{ userId: string | null }>).detail?.userId ?? null
      const userId = eventUserId
        ?? stateRef.current.activeThread?.userId
        ?? stateRef.current.serverSnapshot?.userId
        ?? null
      clearIntegrationCache(userId)
      clearIdempotencyStore(userId)
      activeThreadIdRef.current = null
      nextThreadGeneration()
      clearThreadRequestRefs()
      dispatch({
        type: 'AUTH_SESSION_INVALIDATED',
        error: {
          code: 'AUTH_INVALID',
          message: '当前 XUANOS 会话已失效，请重新登录。',
          status: 401,
          requestId: null,
        },
      })
    }
    window.addEventListener(AUTH_SESSION_INVALIDATED_EVENT, handleInvalidSession)
    return () => window.removeEventListener(AUTH_SESSION_INVALIDATED_EVENT, handleInvalidSession)
  }, [])

  useEffect(() => {
    if (hydratedRef.current) return
    hydratedRef.current = true

    const hydrate = async () => {
      dispatch({ type: 'API_REQUEST_STARTED' })
      let authUserId: string
      try {
        authUserId = (await ensureAuthSession()).userId
      } catch (error) {
        dispatch({ type: 'API_REQUEST_FAILED', error: toApiErrorState(error) })
        return
      }

      try {
        const threads = await listThreads()
        dispatch({ type: 'THREADS_LOADED', threads })
        const preferredId = stateRef.current.activeThreadId
        const recentThread = threads.find((thread) => thread.id === preferredId) ?? threads[0]
        if (recentThread) {
          const cachedState = readThreadIntegrationCache(authUserId, recentThread.id)
          const generation = nextThreadGeneration()
          activeThreadIdRef.current = recentThread.id
          clearThreadRequestRefs()
          dispatch({ type: 'THREAD_SWITCH_STARTED', thread: recentThread, generation })
          const scope = { userId: authUserId, threadId: recentThread.id, generation }
          try {
            const aggregate = await getThread(recentThread.id)
            if (!isRequestCurrent(scope)) return
            dispatch({ type: 'THREAD_AGGREGATE_LOADED', aggregate, scope })
            dispatch({ type: 'THREAD_DRAFT_RESTORED', cachedState, scope })
            dispatch({ type: 'API_SYNC_COMPLETED', scope })
          } catch (error) {
            if (!isRequestCurrent(scope)) return
            dispatch({
              type: 'THREAD_SWITCH_FAILED',
              scope,
              cachedState,
              error: toApiErrorState(error),
            })
          }
          return
        }
        const snapshot = await getCurrentSnapshot()
        dispatch({ type: 'SNAPSHOT_LOADED', snapshot })
        dispatch({ type: 'API_SYNC_COMPLETED' })
      } catch (error) {
        dispatch({ type: 'API_REQUEST_FAILED', error: toApiErrorState(error) })
      }
    }

    void hydrate()
  }, [])

  const switchThread = useCallback(async (threadId: string) => {
    const current = stateRef.current
    const thread = current.availableThreads.find((item) => item.id === threadId)
    const auth = readAuthSession()
    if (!thread || !auth || thread.userId !== auth.userId) return false

    writeIntegrationCache(current)
    const cachedState = readThreadIntegrationCache(auth.userId, thread.id)
    const generation = nextThreadGeneration()
    activeThreadIdRef.current = thread.id
    clearThreadRequestRefs()
    dispatch({ type: 'THREAD_SWITCH_STARTED', thread, generation })
    const scope: RequestScope = { userId: auth.userId, threadId: thread.id, generation }

    try {
      const aggregate = await getThread(thread.id)
      if (!isRequestCurrent(scope)) return false
      dispatch({ type: 'THREAD_AGGREGATE_LOADED', aggregate, scope })
      dispatch({ type: 'THREAD_DRAFT_RESTORED', cachedState, scope })
      dispatch({ type: 'API_SYNC_COMPLETED', scope })
      return true
    } catch (error) {
      if (!isRequestCurrent(scope)) return false
      dispatch({
        type: 'THREAD_SWITCH_FAILED',
        scope,
        cachedState,
        error: toApiErrorState(error),
      })
      return false
    }
  }, [])

  const createNewThread = useCallback(async () => {
    if (createThreadRequestRef.current) return createThreadRequestRef.current
    const requestGeneration = threadGenerationRef.current
    writeIntegrationCache(stateRef.current)
    const request = (async () => {
      dispatch({ type: 'API_REQUEST_STARTED' })
      try {
        const auth = await ensureAuthSession()
        const titleIndex = stateRef.current.availableThreads.length + 1
        const thread = await createThreadOnServer(`XUANOS 任务 ${titleIndex}`)
        if (
          readAuthSession()?.userId !== auth.userId
          || thread.userId !== auth.userId
          || threadGenerationRef.current !== requestGeneration
        ) return false
        const generation = nextThreadGeneration()
        activeThreadIdRef.current = thread.id
        clearThreadRequestRefs()
        dispatch({ type: 'THREAD_CREATED', thread, generation })
        return true
      } catch (error) {
        dispatch({ type: 'API_REQUEST_FAILED', error: toApiErrorState(error) })
        return false
      }
    })()
    createThreadRequestRef.current = request
    try {
      return await request
    } finally {
      if (createThreadRequestRef.current === request) createThreadRequestRef.current = null
    }
  }, [])

  const startCalibration = useCallback(async () => {
    if (stateRef.current.activeThreadId) {
      if (stateRef.current.serverStep === 'idle') dispatch({ type: 'START_CALIBRATION' })
      return true
    }
    return createNewThread()
  }, [createNewThread])

  const refreshSnapshot = useCallback(async () => {
    if (snapshotRequestRef.current) return snapshotRequestRef.current
    const scope = requestScope()
    const request = (async () => {
      dispatch({ type: 'API_REQUEST_STARTED' })
      try {
        const snapshot = await getCurrentSnapshot()
        if (scope && !isRequestCurrent(scope)) return
        dispatch({ type: 'SNAPSHOT_LOADED', snapshot, scope: scope ?? undefined })
        dispatch({ type: 'API_SYNC_COMPLETED', scope: scope ?? undefined })
      } catch (error) {
        if (scope && !isRequestCurrent(scope)) return
        dispatch({
          type: 'API_REQUEST_FAILED',
          error: toApiErrorState(error),
          scope: scope ?? undefined,
        })
      }
    })()
    snapshotRequestRef.current = request
    try {
      await request
    } finally {
      if (snapshotRequestRef.current === request) snapshotRequestRef.current = null
    }
  }, [])

  const failUnderstandingGuard = useCallback((message: string) => {
    const error: ApiErrorState = {
      code: 'INVALID_FLOW_STATE',
      message,
      status: null,
      requestId: null,
    }
    dispatch({ type: 'UNDERSTANDING_REQUEST_FAILED', error })
    return false
  }, [])

  const runUnderstandingAnalyze = useCallback(
    async (input: Parameters<typeof analyzeUnderstanding>[0]) => {
      if (understandingRequestRef.current) return understandingRequestRef.current
      const scope = requestScope(input.threadId)
      if (!scope) return false
      const request = (async () => {
        dispatch({ type: 'UNDERSTANDING_REQUEST_STARTED' })
        try {
          const result = await analyzeUnderstanding(input)
          if (!isRequestCurrent(scope)) return false
          dispatch({ type: 'UNDERSTANDING_ANALYZE_SUCCEEDED', result, scope })
          return true
        } catch (error) {
          if (!isRequestCurrent(scope)) return false
          dispatch({ type: 'UNDERSTANDING_REQUEST_FAILED', error: toApiErrorState(error), scope })
          return false
        }
      })()
      understandingRequestRef.current = request
      try {
        return await request
      } finally {
        if (understandingRequestRef.current === request) understandingRequestRef.current = null
      }
    },
    [],
  )

  const selectExpressionMode = useCallback(
    async (mode: ExpressionMode) => {
      const current = stateRef.current
      if (!current.activeThreadId) return failUnderstandingGuard('请先创建任务线程，再开始理解。')
      if (current.understandingRequestStatus === 'loading') return false
      dispatch({ type: 'SELECT_EXPRESSION_MODE', mode })
      if (mode !== 'ask') return true
      return runUnderstandingAnalyze({
        threadId: current.activeThreadId,
        expressionMode: mode,
      })
    },
    [failUnderstandingGuard, runUnderstandingAnalyze],
  )

  const submitInitialInput = useCallback(async () => {
    const current = stateRef.current
    if (!current.activeThreadId) return failUnderstandingGuard('请先创建任务线程，再提交目标。')
    if (!current.expressionMode) return failUnderstandingGuard('请先选择表达方式。')
    if (!current.userInput.trim()) return failUnderstandingGuard('请先写下目标或当前困境。')
    if (current.understandingRequestStatus === 'loading') return false
    return runUnderstandingAnalyze({
      threadId: current.activeThreadId,
      expressionMode: current.expressionMode,
      userInput: current.userInput,
    })
  }, [failUnderstandingGuard, runUnderstandingAnalyze])

  const submitUnderstandingAnswer = useCallback(async () => {
    const current = stateRef.current
    if (!current.activeThreadId) return failUnderstandingGuard('请先创建任务线程，再提交回答。')
    if (!current.understandingSessionId) return failUnderstandingGuard('理解会话尚未建立，请重新选择表达方式。')
    if (!current.currentQuestion) return failUnderstandingGuard('当前没有可提交的问题。')
    if (!current.currentAnswerDraft.trim()) return failUnderstandingGuard('请先填写当前问题。')
    if (current.understandingRequestStatus === 'loading') return false
    return runUnderstandingAnalyze({
      threadId: current.activeThreadId,
      sessionId: current.understandingSessionId,
      answer: {
        questionId: current.currentQuestion.id,
        answerText: current.currentAnswerDraft,
      },
    })
  }, [failUnderstandingGuard, runUnderstandingAnalyze])

  const confirmUnderstanding = useCallback(
    async (assessment: UnderstandingAssessment, correction?: string) => {
      const current = stateRef.current
      const sessionId = current.understandingSessionId
      if (!sessionId) {
        return failUnderstandingGuard('理解会话尚未建立，无法确认。')
      }
      if (!current.serverUnderstanding || current.understandingSource !== 'api') {
        return failUnderstandingGuard('当前不是可确认的服务端理解结果。')
      }
      if (assessment !== 'accurate' && !correction?.trim()) {
        return failUnderstandingGuard('请先填写需要修正或补充的内容。')
      }
      if (current.understandingRequestStatus === 'loading') return false
      if (understandingRequestRef.current) return understandingRequestRef.current
      const scope = requestScope(current.activeThreadId)
      if (!scope) return failUnderstandingGuard('当前任务线程无效，请重新选择任务。')

      const request = (async () => {
        dispatch({ type: 'UNDERSTANDING_REQUEST_STARTED' })
        try {
          const result = await confirmUnderstandingOnServer(sessionId, scope.threadId, {
            assessment,
            correction,
          })
          if (!isRequestCurrent(scope)) return false
          dispatch({ type: 'UNDERSTANDING_CONFIRM_SUCCEEDED', result, scope })
          return true
        } catch (error) {
          if (!isRequestCurrent(scope)) return false
          dispatch({ type: 'UNDERSTANDING_REQUEST_FAILED', error: toApiErrorState(error), scope })
          return false
        }
      })()
      understandingRequestRef.current = request
      try {
        return await request
      } finally {
        if (understandingRequestRef.current === request) understandingRequestRef.current = null
      }
    },
    [failUnderstandingGuard],
  )

  const failPlanGuard = useCallback((message: string) => {
    const error: ApiErrorState = {
      code: 'INVALID_FLOW_STATE',
      message,
      status: null,
      requestId: null,
    }
    dispatch({ type: 'PLAN_REQUEST_FAILED', error })
    return false
  }, [])

  const runPlanRequest = useCallback(async (
    requestFactory: () => Promise<boolean>,
  ) => {
    if (planRequestRef.current) return planRequestRef.current
    const request = requestFactory()
    planRequestRef.current = request
    try {
      return await request
    } finally {
      if (planRequestRef.current === request) planRequestRef.current = null
    }
  }, [])

  const createCurrentPlan = useCallback(async () => {
    const current = stateRef.current
    if (!current.activeThreadId) return failPlanGuard('请先创建真实任务线程。')
    if (
      current.serverStep !== 'understanding_confirmed'
      || current.understandingStatus !== 'confirmed'
      || !current.understandingSessionId
      || !current.serverUnderstanding
      || current.understandingSource !== 'api'
    ) return failPlanGuard('服务端理解尚未确认，不能创建计划。')
    if (current.isOfflineCache) return failPlanGuard('当前为离线缓存，恢复服务后才能创建计划。')
    if (current.planRequestStatus === 'loading') return false
    const scope = requestScope(current.activeThreadId)
    if (!scope) return failPlanGuard('当前任务线程无效，请重新选择任务。')

    return runPlanRequest(async () => {
      dispatch({ type: 'PLAN_REQUEST_STARTED' })
      try {
        const result = await createPlanOnServer({
          threadId: current.activeThreadId!,
          understandingSessionId: current.understandingSessionId!,
          mainGoal: current.serverUnderstanding!.realGoal,
        })
        if (!isRequestCurrent(scope)) return false
        dispatch({ type: 'PLAN_CREATE_SUCCEEDED', result, scope })
        return true
      } catch (error) {
        if (!isRequestCurrent(scope)) return false
        dispatch({ type: 'PLAN_REQUEST_FAILED', error: toApiErrorState(error), scope })
        return false
      }
    })
  }, [failPlanGuard, runPlanRequest])

  const reviseCurrentPlan = useCallback(async () => {
    const current = stateRef.current
    const plan = current.currentPlan
    const draft = current.planModificationDraft
    if (!plan || !current.activePlanId) return failPlanGuard('当前没有可修改的服务端计划。')
    if (current.planSource !== 'api' || current.isOfflineCache) {
      return failPlanGuard('当前为离线缓存，恢复服务后才能修改计划。')
    }
    if (!draft.reason) return failPlanGuard('请选择计划修改原因。')
    if (!draft.userChoice.trim()) return failPlanGuard('请填写用户最终选择。')
    if (!draft.expectedImpactAcknowledged) return failPlanGuard('请确认已了解本次修改的预计影响。')
    if (current.planRequestStatus === 'loading') return false
    const scope = requestScope(current.activeThreadId)
    if (!scope) return failPlanGuard('当前任务线程无效，请重新选择任务。')

    return runPlanRequest(async () => {
      dispatch({ type: 'PLAN_REQUEST_STARTED' })
      try {
        const result = await revisePlanOnServer({
          threadId: scope.threadId,
          plan,
          reason: draft.reason!,
          userChoice: draft.userChoice,
          expectedImpactAcknowledged: draft.expectedImpactAcknowledged,
          mainGoal: current.serverUnderstanding?.realGoal ?? plan.mainGoal,
        })
        if (!isRequestCurrent(scope)) return false
        dispatch({ type: 'PLAN_REVISE_SUCCEEDED', result, scope })
        return true
      } catch (error) {
        if (!isRequestCurrent(scope)) return false
        dispatch({ type: 'PLAN_REQUEST_FAILED', error: toApiErrorState(error), scope })
        return false
      }
    })
  }, [failPlanGuard, runPlanRequest])

  const acceptCurrentPlan = useCallback(async () => {
    const current = stateRef.current
    const plan = current.currentPlan
    if (!plan || !current.activePlanId) return failPlanGuard('当前没有可接受的服务端计划。')
    if (current.planSource !== 'api' || current.isOfflineCache) {
      return failPlanGuard('当前为离线缓存，恢复服务后才能接受计划。')
    }
    if (!['plan_generated', 'plan_modified'].includes(current.serverStep)) {
      return failPlanGuard('当前服务端流程状态不允许接受计划。')
    }
    if (current.planRequestStatus === 'loading') return false
    const scope = requestScope(current.activeThreadId)
    if (!scope) return failPlanGuard('当前任务线程无效，请重新选择任务。')

    return runPlanRequest(async () => {
      dispatch({ type: 'PLAN_REQUEST_STARTED' })
      try {
        const result = await acceptPlanOnServer({
          threadId: scope.threadId,
          plan,
          mainGoal: current.serverUnderstanding?.realGoal ?? plan.mainGoal,
        })
        if (!isRequestCurrent(scope)) return false
        dispatch({ type: 'PLAN_ACCEPT_SUCCEEDED', result, scope })
        return true
      } catch (error) {
        if (!isRequestCurrent(scope)) return false
        dispatch({ type: 'PLAN_REQUEST_FAILED', error: toApiErrorState(error), scope })
        return false
      }
    })
  }, [failPlanGuard, runPlanRequest])

  const refreshActiveThread = useCallback(async () => {
    const threadId = stateRef.current.activeThreadId
    if (!threadId) return failPlanGuard('当前没有可恢复的任务线程。')
    const scope = requestScope(threadId)
    if (!scope) return failPlanGuard('当前任务线程无效，请重新选择任务。')
    return runPlanRequest(async () => {
      dispatch({ type: 'PLAN_REQUEST_STARTED' })
      try {
        const aggregate = await getThread(threadId)
        if (!isRequestCurrent(scope)) return false
        dispatch({ type: 'THREAD_AGGREGATE_LOADED', aggregate, scope })
        dispatch({ type: 'API_SYNC_COMPLETED', scope })
        return true
      } catch (error) {
        if (!isRequestCurrent(scope)) return false
        dispatch({ type: 'PLAN_REQUEST_FAILED', error: toApiErrorState(error), scope })
        return false
      }
    })
  }, [failPlanGuard, runPlanRequest])

  const failActionResultGuard = useCallback((message: string) => {
    const error: ApiErrorState = {
      code: 'INVALID_FLOW_STATE',
      message,
      status: null,
      requestId: null,
    }
    dispatch({ type: 'ACTION_RESULT_REQUEST_FAILED', error })
    return false
  }, [])

  const submitCurrentActionResult = useCallback(async () => {
    const current = stateRef.current
    const plan = current.currentPlan
    const feedback = current.actionFeedback
    if (!current.activeThreadId) return failActionResultGuard('没有真实任务线程，不能提交行动反馈。')
    if (!plan || plan.status !== 'accepted') return failActionResultGuard('当前计划尚未接受，不能提交反馈。')
    if (!current.activePlanId || current.activePlanId !== plan.id) {
      return failActionResultGuard('当前计划指针无效，请先同步任务线程。')
    }
    if (current.planSource !== 'api' || current.isOfflineCache) {
      return failActionResultGuard('无法连接 XUANOS 服务，反馈草稿已保留。')
    }
    if (!feedback.resultStatus) return failActionResultGuard('请选择本次行动结果。')
    if (
      feedback.actualDurationMinutes === null
      || !Number.isInteger(feedback.actualDurationMinutes)
      || feedback.actualDurationMinutes < 0
    ) return failActionResultGuard('实际用时必须是非负整数分钟。')
    if (!feedback.obstacleCode) return failActionResultGuard('请选择本次最大阻力。')
    if (
      feedback.resultStatus === 'partially_completed'
      && (feedback.progressPercent <= 0 || feedback.progressPercent >= 100)
    ) return failActionResultGuard('部分完成的比例必须在 1% 到 99% 之间。')
    if (!feedback.actionIdentifier || feedback.planId !== plan.id) {
      return failActionResultGuard('当前唯一行动尚未绑定，请重新进入行动反馈。')
    }
    if (current.actionResultRequestStatus === 'loading') return false
    if (actionResultRequestRef.current) return actionResultRequestRef.current
    const scope = requestScope(current.activeThreadId)
    if (!scope) return failActionResultGuard('当前任务线程无效，请重新选择任务。')

    const request = (async () => {
      dispatch({ type: 'ACTION_RESULT_REQUEST_STARTED' })
      try {
        const result = await submitActionResultOnServer({
          threadId: current.activeThreadId!,
          planId: plan.id,
          planItemId: feedback.planItemId,
          actionIdentifier: feedback.actionIdentifier!,
          feedback,
          previousSnapshot: current.latestSnapshot ?? current.serverSnapshot,
        })
        if (!isRequestCurrent(scope)) return false
        dispatch({ type: 'ACTION_RESULT_SUCCEEDED', result, scope })
        try {
          const aggregate = await getThread(scope.threadId)
          if (!isRequestCurrent(scope)) return false
          dispatch({ type: 'THREAD_AGGREGATE_LOADED', aggregate, scope })
        } catch (error) {
          if (!isRequestCurrent(scope)) return false
          dispatch({ type: 'ACTION_RESULT_READBACK_FAILED', error: toApiErrorState(error), scope })
        }
        return true
      } catch (error) {
        if (!isRequestCurrent(scope)) return false
        dispatch({ type: 'ACTION_RESULT_REQUEST_FAILED', error: toApiErrorState(error), scope })
        return false
      }
    })()
    actionResultRequestRef.current = request
    try {
      return await request
    } finally {
      if (actionResultRequestRef.current === request) actionResultRequestRef.current = null
    }
  }, [failActionResultGuard])

  const failCorrectionGuard = useCallback((message: string) => {
    const error: ApiErrorState = {
      code: 'INVALID_FLOW_STATE',
      message,
      status: null,
      requestId: null,
    }
    dispatch({ type: 'CORRECTION_REQUEST_FAILED', error })
    return false
  }, [])

  const submitCurrentCorrection = useCallback(async () => {
    const current = stateRef.current
    const target = current.activeCorrectionTarget
    const correctionType = current.correctionType
    const snapshot = current.latestSnapshot ?? current.serverSnapshot

    if (!current.activeThreadId) return failCorrectionGuard('没有真实任务线程，不能提交纠正。')
    if (!target || !correctionType) return failCorrectionGuard('请先选择纠正对象和纠正类型。')
    if (!snapshot?.id || current.dataSource !== 'api' || current.isOfflineCache) {
      return failCorrectionGuard('无法连接 XUANOS 服务，纠正草稿已保留。')
    }
    if (target.snapshotId !== snapshot.id || target.snapshotVersion !== snapshot.version) {
      return failCorrectionGuard('当前系统条目已经变化，请刷新后重新纠正。')
    }
    if (
      ['partial', 'inaccurate', 'changed'].includes(correctionType)
      && !current.correctionDraft.trim()
    ) return failCorrectionGuard('请填写修正后的内容。')
    if (correctionType === 'discontinue' && !current.correctionDiscontinueConfirmed) {
      return failCorrectionGuard('请确认系统以后不再使用这条判断。')
    }
    if (current.correctionRequestStatus === 'loading') return false
    if (correctionRequestRef.current) return correctionRequestRef.current
    const scope = requestScope(current.activeThreadId)
    if (!scope) return failCorrectionGuard('当前任务线程无效，请重新选择任务。')

    const request = (async () => {
      dispatch({ type: 'CORRECTION_REQUEST_STARTED' })
      try {
        const result = await submitUserCorrection({
          threadId: scope.threadId,
          target,
          correctionType: correctionType as CorrectionType,
          correctedValue: current.correctionDraft,
          reason: current.correctionReason,
          previousSnapshot: snapshot,
        })
        if (!isRequestCurrent(scope)) return false
        dispatch({ type: 'CORRECTION_REQUEST_SUCCEEDED', result, scope })
        try {
          const aggregate = await getThread(scope.threadId)
          if (!isRequestCurrent(scope)) return false
          dispatch({ type: 'THREAD_AGGREGATE_LOADED', aggregate, scope })
        } catch (error) {
          if (!isRequestCurrent(scope)) return false
          dispatch({ type: 'CORRECTION_READBACK_FAILED', error: toApiErrorState(error), scope })
        }
        return true
      } catch (error) {
        if (!isRequestCurrent(scope)) return false
        const normalized = normalizeApiError(error)
        const correctionError = toCorrectionApiErrorState(normalized)
        if (normalized.code === 'STALE_SNAPSHOT') {
          try {
            const latestSnapshot = await getCurrentSnapshot()
            if (!isRequestCurrent(scope)) return false
            dispatch({
              type: 'CORRECTION_STALE_SNAPSHOT_REFRESHED',
              snapshot: latestSnapshot,
              error: correctionError,
              scope,
            })
          } catch {
            if (!isRequestCurrent(scope)) return false
            dispatch({ type: 'CORRECTION_REQUEST_FAILED', error: correctionError, scope })
          }
        } else {
          dispatch({ type: 'CORRECTION_REQUEST_FAILED', error: correctionError, scope })
        }
        return false
      }
    })()
    correctionRequestRef.current = request
    try {
      return await request
    } finally {
      if (correctionRequestRef.current === request) correctionRequestRef.current = null
    }
  }, [failCorrectionGuard])

  const resetDemo = () => {
    clearIntegrationCache()
    dispatch({ type: 'RESET_DEMO_DATA' })
  }

  return (
    <InteractionContext.Provider
      value={{
        state,
        dispatch,
        resetDemo,
        switchThread,
        createNewThread,
        startCalibration,
        refreshSnapshot,
        selectExpressionMode,
        submitInitialInput,
        submitUnderstandingAnswer,
        confirmUnderstanding,
        createCurrentPlan,
        reviseCurrentPlan,
        acceptCurrentPlan,
        refreshActiveThread,
        submitCurrentActionResult,
        submitCurrentCorrection,
        continuePage: pageForStep(state.currentStep),
      }}
    >
      {children}
    </InteractionContext.Provider>
  )
}
