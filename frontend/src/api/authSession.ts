export const AUTH_SESSION_INVALIDATED_EVENT = 'xuanos:auth-session-invalidated'
const LEGACY_AUTH_STORAGE_KEY = 'xuanos:auth-session:v1'

export interface StoredAuthSession {
  userId: string
  displayName: string | null
  phoneMasked: string
  phoneVerified: boolean
  hasPassword: boolean
  needsPasswordSetup: boolean
  expiresAt: string
}

let currentSession: StoredAuthSession | null = null

export function purgeLegacyAuthStorage() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(LEGACY_AUTH_STORAGE_KEY)
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
  try {
    window.sessionStorage.removeItem(LEGACY_AUTH_STORAGE_KEY)
  } catch {
    // Cookie auth remains usable without browser storage.
  }
}

export function readAuthSession(): StoredAuthSession | null {
  if (!currentSession) return null
  if (!Number.isFinite(Date.parse(currentSession.expiresAt)) || Date.parse(currentSession.expiresAt) <= Date.now()) {
    currentSession = null
    return null
  }
  return currentSession
}

export function writeAuthSession(session: StoredAuthSession) {
  currentSession = session
}

export function invalidateAuthSession() {
  const userId = currentSession?.userId ?? null
  currentSession = null
  if (typeof window !== 'undefined') {
    purgeLegacyAuthStorage()
    window.dispatchEvent(new CustomEvent(AUTH_SESSION_INVALIDATED_EVENT, {
      detail: { userId },
    }))
  }
}
