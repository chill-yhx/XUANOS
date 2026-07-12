import type {
  AnswerDto,
  CorrectionDto,
  UnderstandingSessionDto,
  UnderstandingSummaryDto,
} from '../api/dto'
import type {
  AnswerMetadata,
  CorrectionRecord,
  ExpressionMode,
  QuestionId,
  UnderstandingSession,
  UnderstandingSummary,
} from '../types'

const expressionModes = new Set<ExpressionMode>(['speak', 'ask', 'sort'])
const questionIds = new Set<QuestionId>(['desired_result', 'current_foundation', 'real_constraints'])

function expressionMode(value: string): ExpressionMode {
  return expressionModes.has(value as ExpressionMode) ? value as ExpressionMode : 'ask'
}

export function understandingSessionMapper(dto: UnderstandingSessionDto): UnderstandingSession {
  return {
    id: dto.id,
    threadId: dto.thread_id,
    userId: dto.user_id,
    previousSessionId: dto.previous_session_id,
    expressionMode: expressionMode(dto.expression_mode),
    status: dto.status,
    userInput: dto.user_input,
    currentQuestionIndex: dto.current_question_index,
    summaryVersion: dto.summary_version,
    confirmedAt: dto.confirmed_at,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
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
