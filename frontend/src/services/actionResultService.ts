import { apiData } from '../api/apiClient'
import { normalizeApiError } from '../api/apiErrors'
import type { ActionSubmissionResultDto } from '../api/dto'
import { clearIdempotencyKey, getOrCreateIdempotencyKey } from '../api/idempotency'
import {
  fromActionSubmissionResult,
  toActionResultRequest,
  type SubmitActionResultInput,
} from '../mappers/actionResultMapper'
import type { ActionSubmissionResult } from '../types'

export async function submitActionResult(
  input: SubmitActionResultInput,
): Promise<ActionSubmissionResult> {
  const payload = toActionResultRequest(input)
  const operation = `action-result-${input.threadId}-${input.planId}`
  const idempotencyKey = getOrCreateIdempotencyKey(operation, payload)
  try {
    const dto = await apiData<ActionSubmissionResultDto>('/api/action-results', {
      method: 'POST',
      body: payload,
      idempotencyKey,
    })
    clearIdempotencyKey(operation, idempotencyKey)
    return fromActionSubmissionResult(dto, input)
  } catch (error) {
    const normalized = normalizeApiError(error)
    if (!normalized.retryable) clearIdempotencyKey(operation, idempotencyKey)
    throw normalized
  }
}
