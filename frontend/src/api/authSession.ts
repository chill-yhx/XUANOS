const AUTH_STORAGE_KEY = 'xuanos:auth-session:v1'
export const AUTH_SESSION_INVALIDATED_EVENT = 'xuanos:auth-session-invalidated'

export interface StoredAuthSession {
  accessToken: string
  userId: string
  expiresAt: string
}

function isStoredAuthSession(value: unknown): value is StoredAuthSession {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<StoredAuthSession>
  return Boolean(
    candidate.accessToken
    && candidate.userId
    && candidate.expiresAt
    && Number.isFinite(Date.parse(candidate.expiresAt)),
  )
}

export function readAuthSession(): StoredAuthSession | null {
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isStoredAuthSession(parsed) || Date.parse(parsed.expiresAt) <= Date.now()) {
      window.localStorage.removeItem(AUTH_STORAGE_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function writeAuthSession(session: StoredAuthSession) {
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
}

export function invalidateAuthSession() {
  const current = readAuthSession()
  try {
    window.localStorage.removeItem(AUTH_STORAGE_KEY)
  } finally {
    window.dispatchEvent(new CustomEvent(AUTH_SESSION_INVALIDATED_EVENT, {
      detail: { userId: current?.userId ?? null },
    }))
  }
}
