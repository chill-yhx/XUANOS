import type { ThreadAggregateDto, ThreadDto } from '../api/dto'
import type { ActiveThread, InteractionStep, ThreadAggregateState } from '../types'
import { actionResultMapper, systemRevisionMapper } from './actionResultMapper'
import { planMapper } from './planMapper'
import { snapshotMapper } from './snapshotMapper'
import {
  answersMapper,
  correctionMapper,
  understandingMapper,
  understandingSessionMapper,
} from './understandingMapper'

const interactionSteps = new Set<InteractionStep>([
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
])

export function interactionStepMapper(value: string): InteractionStep {
  return interactionSteps.has(value as InteractionStep) ? value as InteractionStep : 'idle'
}

export function threadMapper(dto: ThreadDto): ActiveThread {
  return {
    id: dto.id,
    userId: dto.user_id,
    title: dto.title,
    status: dto.status,
    currentStep: interactionStepMapper(dto.current_step),
    phase: dto.phase,
    activeUnderstandingSessionId: dto.active_understanding_session_id,
    activePlanId: dto.active_plan_id,
    lastActivityAt: dto.last_activity_at,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  }
}

export function threadAggregateMapper(dto: ThreadAggregateDto): ThreadAggregateState {
  const thread = threadMapper(dto.thread)
  const snapshot = snapshotMapper(dto.current_snapshot)
  const understanding = dto.understanding_summary ? understandingMapper(dto.understanding_summary) : null
  const mainGoal = understanding?.realGoal || snapshot.currentVector
  const planVersions = dto.plan_versions.map((plan) => planMapper(plan, mainGoal))
  const currentPlan = dto.current_plan
    ? planVersions.find((plan) => plan.id === dto.current_plan?.id) ?? planMapper(dto.current_plan, mainGoal)
    : null
  const activeUnderstandingSession = dto.active_understanding_session
    ? understandingSessionMapper(dto.active_understanding_session)
    : null
  const { answers, answerMeta } = answersMapper(dto.current_answers)
  const latestActionResult = dto.latest_action_result ? actionResultMapper(dto.latest_action_result) : null

  return {
    thread,
    serverStep: thread.currentStep,
    activeUnderstandingSession,
    expressionMode: activeUnderstandingSession?.expressionMode ?? null,
    userInput: activeUnderstandingSession?.userInput ?? '',
    answers,
    answerMeta,
    currentQuestionIndex: activeUnderstandingSession?.currentQuestionIndex ?? 0,
    understanding,
    corrections: dto.recent_corrections.map(correctionMapper),
    currentPlan,
    planVersions,
    latestActionResult,
    systemRevision: dto.latest_action_result ? systemRevisionMapper(dto.latest_action_result) : null,
    snapshot,
  }
}
