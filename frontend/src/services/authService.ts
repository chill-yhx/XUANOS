import { apiData } from '../api/apiClient'
import { readAuthSession, writeAuthSession, type StoredAuthSession } from '../api/authSession'
import type { AuthOperationResultDto, AuthSessionDto, SendCodeResultDto } from '../api/dto'

let sessionRequest: Promise<StoredAuthSession> | null = null

function mapSession(dto: AuthSessionDto): StoredAuthSession {
  return {
    userId: dto.user.id,
    displayName: dto.user.display_name,
    phoneMasked: dto.user.phone_masked,
    phoneVerified: dto.user.phone_verified,
    hasPassword: dto.user.has_password,
    needsPasswordSetup: dto.needs_password_setup,
    expiresAt: dto.expires_at,
  }
}

async function saveSession(request: Promise<AuthSessionDto>): Promise<StoredAuthSession> {
  const session = mapSession(await request)
  writeAuthSession(session)
  return session
}

export async function ensureAuthSession(): Promise<StoredAuthSession> {
  const current = readAuthSession()
  if (current) return current
  if (sessionRequest) return sessionRequest

  sessionRequest = saveSession(apiData<AuthSessionDto>('/api/auth/me', { requiresAuth: false }))
  try {
    return await sessionRequest
  } finally {
    sessionRequest = null
  }
}

export function sendSmsCode(phone: string, purpose: 'login' | 'reset_password') {
  return apiData<SendCodeResultDto>('/api/auth/send-code', {
    method: 'POST',
    body: { phone, purpose },
    requiresAuth: false,
  })
}

export function loginWithSmsCode(phone: string, code: string) {
  return saveSession(apiData<AuthSessionDto>('/api/auth/verify-code', {
    method: 'POST',
    body: { phone, code },
    requiresAuth: false,
  }))
}

export function loginWithPassword(phone: string, password: string) {
  return saveSession(apiData<AuthSessionDto>('/api/auth/login-password', {
    method: 'POST',
    body: { phone, password },
    requiresAuth: false,
  }))
}

export function setLoginPassword(newPassword: string) {
  return saveSession(apiData<AuthSessionDto>('/api/auth/set-password', {
    method: 'POST',
    body: { new_password: newPassword },
  }))
}

export function changeLoginPassword(currentPassword: string, newPassword: string) {
  return saveSession(apiData<AuthSessionDto>('/api/auth/change-password', {
    method: 'POST',
    body: { current_password: currentPassword, new_password: newPassword },
  }))
}

export function resetLoginPassword(phone: string, code: string, newPassword: string) {
  return apiData<AuthOperationResultDto>('/api/auth/reset-password', {
    method: 'POST',
    body: { phone, code, new_password: newPassword },
    requiresAuth: false,
  })
}

export function logoutSession() {
  return apiData<AuthOperationResultDto>('/api/auth/logout', { method: 'POST' })
}
