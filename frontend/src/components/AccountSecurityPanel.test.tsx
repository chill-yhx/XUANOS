// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StoredAuthSession } from '../api/authSession'
import { AuthContext, type AuthContextValue } from '../state/useAuth'
import { AccountSecurityPanel } from './AccountSecurityPanel'

const session: StoredAuthSession = {
  userId: 'user-auth-test',
  displayName: '测试用户',
  phoneMasked: '138****5678',
  phoneVerified: true,
  hasPassword: false,
  needsPasswordSetup: true,
  expiresAt: '2099-01-01T00:00:00Z',
}

function value(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    status: 'authenticated',
    session,
    startupError: null,
    sendCode: vi.fn(),
    loginCode: vi.fn(),
    loginPassword: vi.fn(),
    setPassword: vi.fn().mockResolvedValue(undefined),
    changePassword: vi.fn().mockResolvedValue(undefined),
    resetPassword: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('account security panel', () => {
  it('lets an SMS-only user set a password', async () => {
    const auth = value()
    render(<AuthContext.Provider value={auth}><AccountSecurityPanel /></AuthContext.Provider>)
    expect(document.body.textContent).toContain('138****5678')
    fireEvent.change(screen.getByLabelText('设置密码'), { target: { value: 'password manager value' } })
    fireEvent.change(screen.getByLabelText('确认密码'), { target: { value: 'password manager value' } })
    fireEvent.click(screen.getByRole('button', { name: '设置密码' }))
    await waitFor(() => expect(auth.setPassword).toHaveBeenCalledWith('password manager value'))
  })

  it('offers password change and logout for a password user', async () => {
    const auth = value({ session: { ...session, hasPassword: true, needsPasswordSetup: false } })
    render(<AuthContext.Provider value={auth}><AccountSecurityPanel /></AuthContext.Provider>)
    fireEvent.change(screen.getByLabelText('当前密码'), { target: { value: 'old password' } })
    fireEvent.change(screen.getByLabelText('新密码'), { target: { value: 'new password manager value' } })
    fireEvent.change(screen.getByLabelText('确认密码'), { target: { value: 'new password manager value' } })
    fireEvent.click(screen.getByRole('button', { name: '修改密码' }))
    await waitFor(() => {
      expect(auth.changePassword).toHaveBeenCalledWith('old password', 'new password manager value')
    })
    fireEvent.click(screen.getByRole('button', { name: '退出登录' }))
    await waitFor(() => expect(auth.logout).toHaveBeenCalledOnce())
  })
})
