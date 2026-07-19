import { createContext, useContext } from 'react'
import type { StoredAuthSession } from '../api/authSession'
import type { SendCodeResultDto } from '../api/dto'

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

export interface AuthContextValue {
  status: AuthStatus
  session: StoredAuthSession | null
  startupError: string | null
  sendCode: (phone: string, purpose: 'login' | 'reset_password') => Promise<SendCodeResultDto>
  loginCode: (phone: string, code: string) => Promise<void>
  loginPassword: (phone: string, password: string) => Promise<void>
  setPassword: (password: string) => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
  resetPassword: (phone: string, code: string, newPassword: string) => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
