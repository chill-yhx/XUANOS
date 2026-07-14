import type {
  ExpressionMode,
  InteractionStep,
  ThreadAggregateState,
  UnderstandingStatus,
} from '../types'

export function recoverServerStep(
  serverStep: InteractionStep,
  understandingStatus: UnderstandingStatus | null,
  hasUnderstanding: boolean,
): InteractionStep {
  if (serverStep !== 'idle') return serverStep
  if (understandingStatus === 'confirmed') return 'understanding_confirmed'
  if (understandingStatus === 'reviewing' || hasUnderstanding) return 'reviewing_understanding'
  if (understandingStatus === 'collecting') return 'asking_question'
  return 'idle'
}

export function serverRecoveryStep(aggregate: ThreadAggregateState): InteractionStep {
  return recoverServerStep(
    aggregate.serverStep,
    aggregate.activeUnderstandingSession?.status ?? null,
    Boolean(aggregate.understanding),
  )
}

export function idleRecoveryStep(expressionMode: ExpressionMode | null): InteractionStep {
  if (expressionMode === 'speak' || expressionMode === 'sort') return 'collecting_input'
  return 'expression_mode'
}

export function uiRecoveryStep(
  serverStep: InteractionStep,
  expressionMode: ExpressionMode | null,
): InteractionStep {
  return serverStep === 'idle' ? idleRecoveryStep(expressionMode) : serverStep
}
