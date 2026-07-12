import type { ApiErrorState } from '../types'

interface ApiErrorBody {
  error?: {
    code?: unknown
    message?: unknown
    details?: unknown
    request_id?: unknown
  }
}

export class ApiError extends Error {
  readonly code: string
  readonly status: number | null
  readonly details: unknown
  readonly requestId: string | null

  constructor(
    message: string,
    options: {
      code: string
      status?: number | null
      details?: unknown
      requestId?: string | null
    },
  ) {
    super(message)
    this.name = 'ApiError'
    this.code = options.code
    this.status = options.status ?? null
    this.details = options.details ?? null
    this.requestId = options.requestId ?? null
  }

  get retryable() {
    return this.status === null || this.status >= 500
  }
}

export function apiErrorFromResponse(status: number, body: unknown): ApiError {
  const payload = body as ApiErrorBody
  const error = payload?.error
  const code = typeof error?.code === 'string' ? error.code : `HTTP_${status}`
  const message = typeof error?.message === 'string' ? error.message : '服务暂时无法处理该请求。'
  const requestId = typeof error?.request_id === 'string' ? error.request_id : null
  return new ApiError(message, { code, status, details: error?.details, requestId })
}

export function normalizeApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (error instanceof Error) {
    return new ApiError(error.message, { code: 'API_UNREACHABLE' })
  }
  return new ApiError('无法连接 XUANOS 服务。', { code: 'API_UNREACHABLE' })
}

export function toApiErrorState(error: unknown): ApiErrorState {
  const normalized = normalizeApiError(error)
  return {
    code: normalized.code,
    message: normalized.message,
    status: normalized.status,
    requestId: normalized.requestId,
  }
}
