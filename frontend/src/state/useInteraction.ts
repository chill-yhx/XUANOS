import { createContext, useContext, type Dispatch } from 'react'
import type { DemoSessionState, PageId } from '../types'
import type { InteractionAction } from './interactionReducer'

export interface InteractionContextValue {
  state: DemoSessionState
  dispatch: Dispatch<InteractionAction>
  resetDemo: () => void
  continuePage: PageId
}

export const InteractionContext = createContext<InteractionContextValue | null>(null)

export function useInteraction() {
  const context = useContext(InteractionContext)
  if (!context) throw new Error('useInteraction must be used inside InteractionProvider')
  return context
}
