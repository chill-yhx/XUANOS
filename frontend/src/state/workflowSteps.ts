import type { InteractionStep } from '../types'

const workflowStepOrder: InteractionStep[] = [
  'idle',
  'expression_mode',
  'collecting_input',
  'asking_question',
  'reviewing_understanding',
  'understanding_confirmed',
  'plan_generated',
  'plan_modified',
  'plan_accepted',
  'action_pending',
  'feedback_submitted',
  'system_revised',
]

const workflowStepRank = new Map(workflowStepOrder.map((step, rank) => [step, rank]))

export function laterInteractionStep(
  current: InteractionStep,
  incoming: InteractionStep,
): InteractionStep {
  const currentRank = workflowStepRank.get(current) ?? -1
  const incomingRank = workflowStepRank.get(incoming) ?? -1
  return incomingRank >= currentRank ? incoming : current
}
