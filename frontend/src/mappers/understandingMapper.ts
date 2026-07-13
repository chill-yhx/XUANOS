import type {
  AnswerDto,
  CorrectionDto,
  UnderstandingAnalyzeRequestDto,
  UnderstandingAnalyzeResultDto,
  UnderstandingConfirmRequestDto,
  UnderstandingConfirmResultDto,
  UnderstandingQuestionDto,
  UnderstandingSessionDto,
  UnderstandingSummaryDto,
} from '../api/dto'
import type {
  AnswerMetadata,
  CorrectionRecord,
  ExpressionMode,
  InteractionStep,
  QuestionId,
  UnderstandingAnalyzeResult,
  UnderstandingAssessment,
  UnderstandingConfirmResult,
  UnderstandingQuestion,
  UnderstandingSession,
  UnderstandingStatus,
  UnderstandingSummary,
} from '../types'
import { snapshotMapper } from './snapshotMapper'

const expressionModes = new Set<ExpressionMode>(['speak', 'ask', 'sort'])
const questionIds = new Set<QuestionId>(['desired_result', 'current_foundation', 'real_constraints'])
const understandingStatuses = new Set<UnderstandingStatus>(['collecting', 'reviewing', 'confirmed'])
const understandingSteps = new Set<InteractionStep>([
  'asking_question',
  'reviewing_understanding',
  'understanding_confirmed',
])

export interface AnalyzeUnderstandingInput {
  threadId: string
  sessionId?: string | null
  expressionMode?: ExpressionMode | null
  userInput?: string | null
  answer?: {
    questionId: QuestionId
    answerText: string
  } | null
}

export interface ConfirmUnderstandingInput {
  assessment: UnderstandingAssessment
  correction?: string | null
}

function expressionMode(value: string): ExpressionMode {
  return expressionModes.has(value as ExpressionMode) ? value as ExpressionMode : 'ask'
}

function understandingStatus(value: string): UnderstandingStatus {
  return understandingStatuses.has(value as UnderstandingStatus) ? value as UnderstandingStatus : 'collecting'
}

function understandingStep(value: string): InteractionStep {
  return understandingSteps.has(value as InteractionStep) ? value as InteractionStep : 'asking_question'
}

function questionId(value: string): QuestionId {
  return questionIds.has(value as QuestionId) ? value as QuestionId : 'desired_result'
}

export function understandingSessionMapper(dto: UnderstandingSessionDto): UnderstandingSession {
  return {
    id: dto.id,
    threadId: dto.thread_id,
    userId: dto.user_id,
    previousSessionId: dto.previous_session_id,
    expressionMode: expressionMode(dto.expression_mode),
    status: understandingStatus(dto.status),
    userInput: dto.user_input,
    currentQuestionIndex: dto.current_question_index,
    summaryVersion: dto.summary_version,
    confirmedAt: dto.confirmed_at,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  }
}

export function understandingQuestionMapper(dto: UnderstandingQuestionDto): UnderstandingQuestion {
  return {
    id: questionId(dto.id),
    prompt: dto.prompt,
    hint: dto.hint,
    index: dto.index,
    total: dto.total,
  }
}

export function understandingMapper(dto: UnderstandingSummaryDto): UnderstandingSummary {
  return {
    realGoal: dto.real_goal,
    foundation: dto.foundation,
    constraints: dto.constraints,
    tension: dto.tension,
    uncertain: dto.uncertain,
  }
}

export function answersMapper(dtos: AnswerDto[]): {
  answers: Partial<Record<QuestionId, string>>
  answerMeta: Partial<Record<QuestionId, AnswerMetadata>>
} {
  const answers: Partial<Record<QuestionId, string>> = {}
  const answerMeta: Partial<Record<QuestionId, AnswerMetadata>> = {}
  for (const dto of dtos) {
    if (!questionIds.has(dto.question_id as QuestionId)) continue
    const questionId = dto.question_id as QuestionId
    answers[questionId] = dto.answer_text
    answerMeta[questionId] = {
      id: dto.id,
      revision: dto.revision,
      answeredAt: dto.answered_at,
      createdAt: dto.created_at,
      updatedAt: dto.updated_at,
    }
  }
  return { answers, answerMeta }
}

export function correctionMapper(dto: CorrectionDto): CorrectionRecord {
  return {
    id: dto.id,
    target: dto.target_type,
    targetType: dto.target_type,
    targetId: dto.target_id,
    assessment: dto.assessment,
    previousValue: dto.previous_value,
    userValue: dto.user_value,
    reason: dto.reason,
    systemHandling: dto.system_handling,
    hasConflict: dto.has_conflict,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  }
}

export function toAnalyzeRequest(input: AnalyzeUnderstandingInput): UnderstandingAnalyzeRequestDto {
  return {
    thread_id: input.threadId,
    session_id: input.sessionId ?? null,
    expression_mode: input.expressionMode ?? null,
    user_input: input.userInput?.trim() || null,
    answer: input.answer
      ? {
          question_id: input.answer.questionId,
          answer_text: input.answer.answerText.trim(),
        }
      : null,
  }
}

export function fromAnalyzeResult(dto: UnderstandingAnalyzeResultDto): UnderstandingAnalyzeResult {
  const { answers, answerMeta } = answersMapper(dto.current_answers)
  return {
    session: understandingSessionMapper(dto.session),
    submittedAnswers: answers,
    answerMeta,
    nextQuestion: dto.next_question ? understandingQuestionMapper(dto.next_question) : null,
    understanding: dto.understanding ? understandingMapper(dto.understanding) : null,
    currentStep: understandingStep(dto.current_step),
  }
}

export function toConfirmRequest(input: ConfirmUnderstandingInput): UnderstandingConfirmRequestDto {
  return {
    assessment: input.assessment,
    correction: input.correction?.trim() || null,
  }
}

export function fromConfirmResult(dto: UnderstandingConfirmResultDto): UnderstandingConfirmResult {
  return {
    session: understandingSessionMapper(dto.session),
    understanding: understandingMapper(dto.understanding),
    correction: dto.correction ? correctionMapper(dto.correction) : null,
    snapshot: dto.snapshot ? snapshotMapper(dto.snapshot) : null,
    currentStep: understandingStep(dto.current_step),
  }
}
