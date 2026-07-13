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
  const publicError = publicApiError(normalized)
  return {
    code: publicError.code,
    message: publicError.message,
    status: normalized.status,
    requestId: normalized.requestId,
  }
}

export function toCorrectionApiErrorState(error: unknown): ApiErrorState {
  const state = toApiErrorState(error)
  if (state.code === 'NETWORK_ERROR') {
    return { ...state, message: '无法连接 XUANOS 服务，纠正草稿已保留。' }
  }
  if (state.code === 'TIMEOUT') {
    return { ...state, message: '纠正请求超时，草稿和待重试请求均已保留。' }
  }
  if (state.code === 'RESOURCE_NOT_FOUND') {
    return { ...state, message: '当前系统条目已经变化，请刷新后重新纠正。' }
  }
  if (state.code === 'STALE_SNAPSHOT') {
    return { ...state, message: '系统状态已经更新，请检查最新内容后重新提交。' }
  }
  if (state.code === 'VALIDATION_ERROR') {
    return { ...state, message: '纠正内容未通过校验，请检查后重试。' }
  }
  if (state.code === 'DUPLICATE_SUBMISSION') {
    return { ...state, message: '纠正请求内容已经变化，请重新确认后提交。' }
  }
  return { ...state, message: state.message || '纠正尚未保存，请重试。' }
}

function publicApiError(error: ApiError): { code: string; message: string } {
  if (['AUTH_REQUIRED', 'AUTH_INVALID', 'AUTH_EXPIRED'].includes(error.code)) {
    return {
      code: 'AUTH_INVALID',
      message: '当前 XUANOS 会话无效，请刷新页面重新建立安全会话。',
    }
  }
  if (error.code === 'API_UNREACHABLE') {
    return {
      code: 'NETWORK_ERROR',
      message: '无法连接 XUANOS 服务，请检查后端是否启动。',
    }
  }
  if (error.code === 'API_TIMEOUT') {
    return { code: 'TIMEOUT', message: '请求超时，本次内容仍已保留。' }
  }
  if (error.code === 'VALIDATION_ERROR') {
    return { code: error.code, message: '提交内容未通过校验，请检查后重试。' }
  }
  if (error.code === 'INVALID_FLOW_STATE') {
    return { code: error.code, message: '当前流程状态不允许执行此操作。' }
  }
  if (error.code === 'RESOURCE_NOT_FOUND') {
    return { code: error.code, message: '当前任务、计划或流程记录不存在。' }
  }
  if (error.code === 'DUPLICATE_SUBMISSION') {
    return { code: error.code, message: '检测到重复提交，请确认内容后重试。' }
  }
  if (error.code === 'STALE_SNAPSHOT') {
    return { code: error.code, message: '系统状态已经更新，请检查最新内容后重新提交。' }
  }
  if (error.code === 'VERSION_CONFLICT') {
    return { code: error.code, message: '计划版本已经变化，请同步最新版本后重试。' }
  }
  if (error.code === 'UNDERSTANDING_NOT_CONFIRMED') {
    return { code: error.code, message: '服务端理解尚未确认，当前不能生成计划。' }
  }
  if (error.code === 'PLAN_NOT_ACCEPTED') {
    return { code: error.code, message: '当前计划尚未接受，不能进入行动阶段。' }
  }
  if (
    error.code === 'INTERNAL_ERROR'
    || error.code === 'INVALID_API_RESPONSE'
    || error.status !== null && error.status >= 500
  ) {
    return { code: 'SERVER_ERROR', message: 'XUANOS 服务暂时无法处理本次请求。' }
  }
  return { code: error.code, message: error.message || '本次请求未完成，请重试。' }
}
