import { useCallback, useEffect, useReducer, useRef, type ReactNode } from 'react'
import { toApiErrorState } from '../api/apiErrors'
import { getCurrentSnapshot } from '../services/snapshotService'
import {
  acceptPlan as acceptPlanOnServer,
  createPlan as createPlanOnServer,
  revisePlan as revisePlanOnServer,
} from '../services/planService'
import { createThread, getThread, listThreads } from '../services/threadService'
import {
  analyzeUnderstanding,
  confirmUnderstanding as confirmUnderstandingOnServer,
} from '../services/understandingService'
import type {
  ApiErrorState,
  ExpressionMode,
  InteractionStep,
  PageId,
  UnderstandingAssessment,
} from '../types'
import { clearIntegrationCache, restoreIntegrationState, writeIntegrationCache } from './integrationCache'
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

  useEffect(() => {
    stateRef.current = state
    writeIntegrationCache(state)
  }, [state])

  useEffect(() => {
    if (hydratedRef.current) return
    hydratedRef.current = true

    const hydrate = async () => {
      dispatch({ type: 'API_REQUEST_STARTED' })
      let firstError: unknown = null

      const [threadsResult, snapshotResult] = await Promise.allSettled([
        listThreads(),
        getCurrentSnapshot(),
      ])

      if (threadsResult.status === 'fulfilled') {
        const threads = threadsResult.value
        dispatch({ type: 'THREADS_LOADED', threads })
        const preferredId = stateRef.current.activeThreadId
        const recentThread = threads.find((thread) => thread.id === preferredId) ?? threads[0]
        if (recentThread) {
          try {
            const aggregate = await getThread(recentThread.id)
            dispatch({ type: 'THREAD_AGGREGATE_LOADED', aggregate })
          } catch (error) {
            firstError = error
          }
        }
      } else {
        firstError = threadsResult.reason
      }

      if (snapshotResult.status === 'fulfilled') {
        dispatch({ type: 'SNAPSHOT_LOADED', snapshot: snapshotResult.value })
      } else {
        firstError ??= snapshotResult.reason
      }

      if (firstError) dispatch({ type: 'API_REQUEST_FAILED', error: toApiErrorState(firstError) })
      else dispatch({ type: 'API_SYNC_COMPLETED' })
    }

    void hydrate()
  }, [])

  const startCalibration = useCallback(async () => {
    if (stateRef.current.activeThreadId) {
      dispatch({ type: 'START_CALIBRATION' })
      return true
    }
    if (createThreadRequestRef.current) return createThreadRequestRef.current

    const request = (async () => {
      dispatch({ type: 'API_REQUEST_STARTED' })
      try {
        const thread = await createThread('XUANOS 暑假开发')
        dispatch({ type: 'THREAD_CREATED', thread })
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

  const refreshSnapshot = useCallback(async () => {
    if (snapshotRequestRef.current) return snapshotRequestRef.current
    const request = (async () => {
      dispatch({ type: 'API_REQUEST_STARTED' })
      try {
        const snapshot = await getCurrentSnapshot()
        dispatch({ type: 'SNAPSHOT_LOADED', snapshot })
        dispatch({ type: 'API_SYNC_COMPLETED' })
      } catch (error) {
        dispatch({ type: 'API_REQUEST_FAILED', error: toApiErrorState(error) })
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
      const request = (async () => {
        dispatch({ type: 'UNDERSTANDING_REQUEST_STARTED' })
        try {
          const result = await analyzeUnderstanding(input)
          dispatch({ type: 'UNDERSTANDING_ANALYZE_SUCCEEDED', result })
          return true
        } catch (error) {
          dispatch({ type: 'UNDERSTANDING_REQUEST_FAILED', error: toApiErrorState(error) })
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
      if (!current.serverUnderstanding || current.understandingSource === 'mock') {
        return failUnderstandingGuard('当前不是可确认的服务端理解结果。')
      }
      if (assessment !== 'accurate' && !correction?.trim()) {
        return failUnderstandingGuard('请先填写需要修正或补充的内容。')
      }
      if (current.understandingRequestStatus === 'loading') return false
      if (understandingRequestRef.current) return understandingRequestRef.current

      const request = (async () => {
        dispatch({ type: 'UNDERSTANDING_REQUEST_STARTED' })
        try {
          const result = await confirmUnderstandingOnServer(sessionId, {
            assessment,
            correction,
          })
          dispatch({ type: 'UNDERSTANDING_CONFIRM_SUCCEEDED', result })
          return true
        } catch (error) {
          dispatch({ type: 'UNDERSTANDING_REQUEST_FAILED', error: toApiErrorState(error) })
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

    return runPlanRequest(async () => {
      dispatch({ type: 'PLAN_REQUEST_STARTED' })
      try {
        const result = await createPlanOnServer({
          threadId: current.activeThreadId!,
          understandingSessionId: current.understandingSessionId!,
          mainGoal: current.serverUnderstanding!.realGoal,
        })
        dispatch({ type: 'PLAN_CREATE_SUCCEEDED', result })
        return true
      } catch (error) {
        dispatch({ type: 'PLAN_REQUEST_FAILED', error: toApiErrorState(error) })
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

    return runPlanRequest(async () => {
      dispatch({ type: 'PLAN_REQUEST_STARTED' })
      try {
        const result = await revisePlanOnServer({
          plan,
          reason: draft.reason!,
          userChoice: draft.userChoice,
          expectedImpactAcknowledged: draft.expectedImpactAcknowledged,
          mainGoal: current.serverUnderstanding?.realGoal ?? plan.mainGoal,
        })
        dispatch({ type: 'PLAN_REVISE_SUCCEEDED', result })
        return true
      } catch (error) {
        dispatch({ type: 'PLAN_REQUEST_FAILED', error: toApiErrorState(error) })
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

    return runPlanRequest(async () => {
      dispatch({ type: 'PLAN_REQUEST_STARTED' })
      try {
        const result = await acceptPlanOnServer({
          plan,
          mainGoal: current.serverUnderstanding?.realGoal ?? plan.mainGoal,
        })
        dispatch({ type: 'PLAN_ACCEPT_SUCCEEDED', result })
        return true
      } catch (error) {
        dispatch({ type: 'PLAN_REQUEST_FAILED', error: toApiErrorState(error) })
        return false
      }
    })
  }, [failPlanGuard, runPlanRequest])

  const refreshActiveThread = useCallback(async () => {
    const threadId = stateRef.current.activeThreadId
    if (!threadId) return failPlanGuard('当前没有可恢复的任务线程。')
    return runPlanRequest(async () => {
      dispatch({ type: 'PLAN_REQUEST_STARTED' })
      try {
        const aggregate = await getThread(threadId)
        dispatch({ type: 'THREAD_AGGREGATE_LOADED', aggregate })
        dispatch({ type: 'API_SYNC_COMPLETED' })
        return true
      } catch (error) {
        dispatch({ type: 'PLAN_REQUEST_FAILED', error: toApiErrorState(error) })
        return false
      }
    })
  }, [failPlanGuard, runPlanRequest])

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
        continuePage: pageForStep(state.currentStep),
      }}
    >
      {children}
    </InteractionContext.Provider>
  )
}
