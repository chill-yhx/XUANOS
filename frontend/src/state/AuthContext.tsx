import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ApiError, toApiErrorState } from '../api/apiErrors'
import {
  AUTH_SESSION_INVALIDATED_EVENT,
  invalidateAuthSession,
  purgeLegacyAuthStorage,
  type StoredAuthSession,
} from '../api/authSession'
import {
  changeLoginPassword,
  ensureAuthSession,
  loginWithPassword,
  loginWithSmsCode,
  logoutSession,
  resetLoginPassword,
  sendSmsCode,
  setLoginPassword,
} from '../services/authService'
import { AuthContext, type AuthContextValue, type AuthStatus } from './useAuth'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [session, setSession] = useState<StoredAuthSession | null>(null)
  const [startupError, setStartupError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    purgeLegacyAuthStorage()
    void ensureAuthSession()
      .then((restored) => {
        if (!active) return
        setSession(restored)
        setStatus('authenticated')
        setStartupError(null)
      })
      .catch((error: unknown) => {
        if (!active) return
        const normalized = error instanceof ApiError ? error : null
        if (!normalized || normalized.status !== 401) {
          setStartupError(toApiErrorState(error).message)
        }
        setSession(null)
        setStatus('unauthenticated')
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const handleInvalidation = () => {
      setSession(null)
      setStatus('unauthenticated')
    }
    window.addEventListener(AUTH_SESSION_INVALIDATED_EVENT, handleInvalidation)
    return () => window.removeEventListener(AUTH_SESSION_INVALIDATED_EVENT, handleInvalidation)
  }, [])

  const applySession = useCallback((next: StoredAuthSession) => {
    setSession(next)
    setStatus('authenticated')
    setStartupError(null)
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    status,
    session,
    startupError,
    sendCode: sendSmsCode,
    loginCode: async (phone, code) => applySession(await loginWithSmsCode(phone, code)),
    loginPassword: async (phone, password) => applySession(await loginWithPassword(phone, password)),
    setPassword: async (password) => applySession(await setLoginPassword(password)),
    changePassword: async (currentPassword, newPassword) => {
      applySession(await changeLoginPassword(currentPassword, newPassword))
    },
    resetPassword: async (phone, code, newPassword) => {
      await resetLoginPassword(phone, code, newPassword)
    },
    logout: async () => {
      await logoutSession()
      invalidateAuthSession()
    },
  }), [applySession, session, startupError, status])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
