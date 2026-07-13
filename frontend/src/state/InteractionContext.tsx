import { useCallback, useEffect, useReducer, useRef, type ReactNode } from 'react'
import { toApiErrorState } from '../api/apiErrors'
import { getCurrentSnapshot } from '../services/snapshotService'
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
        continuePage: pageForStep(state.currentStep),
      }}
    >
      {children}
    </InteractionContext.Provider>
  )
}
