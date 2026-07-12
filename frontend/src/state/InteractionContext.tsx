import { useCallback, useEffect, useReducer, useRef, type ReactNode } from 'react'
import { toApiErrorState } from '../api/apiErrors'
import { getCurrentSnapshot } from '../services/snapshotService'
import { createThread, getThread, listThreads } from '../services/threadService'
import type { InteractionStep, PageId } from '../types'
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
        continuePage: pageForStep(state.currentStep),
      }}
    >
      {children}
    </InteractionContext.Provider>
  )
}
