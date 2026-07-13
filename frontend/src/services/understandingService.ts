import { apiData } from '../api/apiClient'
import { normalizeApiError } from '../api/apiErrors'
import { clearIdempotencyKey, getOrCreateIdempotencyKey } from '../api/idempotency'
import {
  fromAnalyzeResult,
  fromConfirmResult,
  toAnalyzeRequest,
  toConfirmRequest,
  type AnalyzeUnderstandingInput,
  type ConfirmUnderstandingInput,
} from '../mappers/understandingMapper'
import type { UnderstandingAnalyzeResult, UnderstandingConfirmResult } from '../types'

async function writeWithIdempotency<TDto, TResult>(
  operation: string,
  path: string,
  payload: unknown,
  map: (dto: TDto) => TResult,
): Promise<TResult> {
  const idempotencyKey = getOrCreateIdempotencyKey(operation, payload)
  try {
    const dto = await apiData<TDto>(path, {
      method: 'POST',
      body: payload,
      idempotencyKey,
    })
    clearIdempotencyKey(operation, idempotencyKey)
    return map(dto)
  } catch (error) {
    const normalized = normalizeApiError(error)
    if (!normalized.retryable) clearIdempotencyKey(operation, idempotencyKey)
    throw normalized
  }
}

export async function analyzeUnderstanding(
  input: AnalyzeUnderstandingInput,
): Promise<UnderstandingAnalyzeResult> {
  const payload = toAnalyzeRequest(input)
  const operation = input.answer
    ? `understanding-answer-${input.sessionId}-${input.answer.questionId}`
    : `understanding-start-${input.threadId}`
  return writeWithIdempotency(
    operation,
    '/api/understanding/analyze',
    payload,
    fromAnalyzeResult,
  )
}

export async function confirmUnderstanding(
  sessionId: string,
  input: ConfirmUnderstandingInput,
): Promise<UnderstandingConfirmResult> {
  const payload = toConfirmRequest(input)
  return writeWithIdempotency(
    `understanding-confirm-${sessionId}`,
    `/api/understanding/${encodeURIComponent(sessionId)}/confirm`,
    payload,
    fromConfirmResult,
  )
}
