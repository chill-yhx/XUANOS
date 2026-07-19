import { ApiError, apiErrorFromResponse } from './apiErrors'
import { invalidateAuthSession, readAuthSession } from './authSession'
import type { ApiEnvelope } from './dto'

const DEFAULT_API_HOST = typeof window === 'undefined' ? 'localhost' : window.location.hostname
const DEFAULT_API_BASE_URL = `http://${DEFAULT_API_HOST}:8000`

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL).replace(/\/$/, '')

interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  timeoutMs?: number
  idempotencyKey?: string
  headers?: Record<string, string>
  requiresAuth?: boolean
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const controller = new AbortController()
  const timeoutMs = options.timeoutMs ?? (options.method && options.method !== 'GET' ? 20_000 : 10_000)
  let timedOut = false
  const timeout = globalThis.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  try {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...options.headers,
    }
    if (options.body !== undefined) headers['Content-Type'] = 'application/json'
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey
    if (options.requiresAuth !== false) {
      const authSession = readAuthSession()
      if (!authSession) {
        invalidateAuthSession()
        throw new ApiError('需要有效的 XUANOS 会话。', { code: 'AUTH_REQUIRED', status: 401 })
      }
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'include',
      signal: controller.signal,
    })
    const text = await response.text()
    let payload: unknown = null
    if (text) {
      try {
        payload = JSON.parse(text)
      } catch {
        throw new ApiError('服务返回了无法解析的数据。', {
          code: 'INVALID_API_RESPONSE',
          status: response.status,
        })
      }
    }
    if (!response.ok) {
      if (response.status === 401) invalidateAuthSession()
      throw apiErrorFromResponse(response.status, payload)
    }
    return payload as T
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (timedOut) throw new ApiError('请求超时，请检查后端服务。', { code: 'API_TIMEOUT' })
    throw new ApiError('无法连接 XUANOS 后端服务。', { code: 'API_UNREACHABLE' })
  } finally {
    globalThis.clearTimeout(timeout)
  }
}

export async function apiData<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const envelope = await apiRequest<ApiEnvelope<T>>(path, options)
  if (!envelope || typeof envelope !== 'object' || !('data' in envelope)) {
    throw new ApiError('服务响应缺少 data。', { code: 'INVALID_API_RESPONSE' })
  }
  return envelope.data
}
