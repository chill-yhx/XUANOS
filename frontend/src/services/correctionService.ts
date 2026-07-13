import { apiData } from '../api/apiClient'
import { normalizeApiError } from '../api/apiErrors'
import type { UserCorrectionResultDto } from '../api/dto'
import { clearIdempotencyKey, getOrCreateIdempotencyKey } from '../api/idempotency'
import {
  fromCorrectionResult,
  toCorrectionRequest,
  type SubmitCorrectionInput,
} from '../mappers/correctionMapper'
import { snapshotMapper } from '../mappers/snapshotMapper'
import type { UserCorrectionResult } from '../types'
import { getCurrentSnapshot } from './snapshotService'

export async function submitUserCorrection(
  input: SubmitCorrectionInput,
): Promise<UserCorrectionResult> {
  const payload = toCorrectionRequest(input)
  const operation = `user-correction-${input.target.targetType}-${input.target.targetId}`
  const idempotencyKey = getOrCreateIdempotencyKey(operation, payload)

  try {
    const dto = await apiData<UserCorrectionResultDto>('/api/users/me/corrections', {
      method: 'POST',
      body: payload,
      idempotencyKey,
    })
    const snapshot = dto.snapshot ? snapshotMapper(dto.snapshot) : await getCurrentSnapshot()
    const result = fromCorrectionResult(
      dto.correction,
      snapshot,
      dto.snapshot_updated,
      input,
    )
    clearIdempotencyKey(operation, idempotencyKey)
    return result
  } catch (error) {
    const normalized = normalizeApiError(error)
    if (!normalized.retryable) clearIdempotencyKey(operation, idempotencyKey)
    throw normalized
  }
}
