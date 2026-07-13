import { createContext, useContext, type Dispatch } from 'react'
import type {
  DemoSessionState,
  ExpressionMode,
  PageId,
  UnderstandingAssessment,
} from '../types'
import type { InteractionAction } from './interactionReducer'

export interface InteractionContextValue {
  state: DemoSessionState
  dispatch: Dispatch<InteractionAction>
  resetDemo: () => void
  startCalibration: () => Promise<boolean>
  refreshSnapshot: () => Promise<void>
  selectExpressionMode: (mode: ExpressionMode) => Promise<boolean>
  submitInitialInput: () => Promise<boolean>
  submitUnderstandingAnswer: () => Promise<boolean>
  confirmUnderstanding: (assessment: UnderstandingAssessment, correction?: string) => Promise<boolean>
  continuePage: PageId
}

export const InteractionContext = createContext<InteractionContextValue | null>(null)

export function useInteraction() {
  const context = useContext(InteractionContext)
  if (!context) throw new Error('useInteraction must be used inside InteractionProvider')
  return context
}
