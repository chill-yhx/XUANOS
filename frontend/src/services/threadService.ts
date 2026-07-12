import { apiData } from '../api/apiClient'
import { normalizeApiError } from '../api/apiErrors'
import type { ThreadAggregateDto, ThreadDto } from '../api/dto'
import { clearIdempotencyKey, getOrCreateIdempotencyKey } from '../api/idempotency'
import { threadAggregateMapper, threadMapper } from '../mappers/threadAggregateMapper'
import type { ActiveThread, ThreadAggregateState } from '../types'

const CREATE_THREAD_OPERATION = 'create-thread'

export async function createThread(title: string): Promise<ActiveThread> {
  const payload = { title: title.trim() }
  const idempotencyKey = getOrCreateIdempotencyKey(CREATE_THREAD_OPERATION, payload)
  try {
    const dto = await apiData<ThreadDto>('/api/threads', {
      method: 'POST',
      body: payload,
      idempotencyKey,
    })
    clearIdempotencyKey(CREATE_THREAD_OPERATION, idempotencyKey)
    return threadMapper(dto)
  } catch (error) {
    const normalized = normalizeApiError(error)
    if (!normalized.retryable) clearIdempotencyKey(CREATE_THREAD_OPERATION, idempotencyKey)
    throw normalized
  }
}

export async function listThreads(limit = 20, status?: string): Promise<ActiveThread[]> {
  const query = new URLSearchParams({ limit: String(limit) })
  if (status) query.set('status', status)
  const dtos = await apiData<ThreadDto[]>(`/api/threads?${query.toString()}`)
  return dtos.map(threadMapper)
}

export async function getThread(threadId: string): Promise<ThreadAggregateState> {
  const dto = await apiData<ThreadAggregateDto>(`/api/threads/${encodeURIComponent(threadId)}`)
  return threadAggregateMapper(dto)
}
