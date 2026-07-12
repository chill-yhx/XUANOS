import { useEffect, useReducer, type ReactNode } from 'react'
import { createInitialSession } from '../data/interactionMock'
import type { DemoSessionState, InteractionStep, PageId } from '../types'
import { interactionReducer } from './interactionReducer'
import { InteractionContext } from './useInteraction'

const STORAGE_KEY = 'xuanos:demo-user:session:v1'

const validSteps: InteractionStep[] = [
  'idle', 'expression_mode', 'collecting_input', 'asking_question',
  'reviewing_understanding', 'understanding_confirmed', 'plan_generated',
  'plan_modified', 'plan_accepted', 'action_pending', 'feedback_submitted', 'system_revised',
]

function restoreSession(): DemoSessionState {
  const fallback = createInitialSession()

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallback
    const saved = JSON.parse(raw) as Partial<DemoSessionState>
    if (saved.schemaVersion !== 1 || !saved.currentStep || !validSteps.includes(saved.currentStep)) return fallback

    return {
      ...fallback,
      ...saved,
      answers: saved.answers || {},
      corrections: saved.corrections || [],
      planVersions: saved.planVersions || [],
      actionFeedback: { ...fallback.actionFeedback, ...saved.actionFeedback },
      systemSnapshot: { ...fallback.systemSnapshot, ...saved.systemSnapshot },
      activeThread: { ...fallback.activeThread, ...saved.activeThread },
    }
  } catch {
    return fallback
  }
}

function pageForStep(step: InteractionStep): PageId {
  if (['expression_mode', 'collecting_input', 'asking_question', 'reviewing_understanding', 'understanding_confirmed'].includes(step)) return 'understanding'
  if (['plan_generated', 'plan_modified', 'plan_accepted'].includes(step)) return 'plan'
  if (['action_pending', 'feedback_submitted'].includes(step)) return 'feedback'
  if (step === 'system_revised') return 'system'
  return 'home'
}

export function InteractionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(interactionReducer, undefined, restoreSession)

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // The demo remains usable in memory when browser storage is unavailable.
    }
  }, [state])

  const resetDemo = () => {
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Reset the in-memory state even when storage is unavailable.
    }
    dispatch({ type: 'RESET_DEMO_DATA' })
  }

  return (
    <InteractionContext.Provider value={{ state, dispatch, resetDemo, continuePage: pageForStep(state.currentStep) }}>
      {children}
    </InteractionContext.Provider>
  )
}
