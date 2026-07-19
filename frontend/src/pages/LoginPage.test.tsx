// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/apiErrors'
import { AuthContext, type AuthContextValue } from '../state/useAuth'
import { LoginPage } from './LoginPage'
import { sanitizeMainlandPhoneInput, secondsUntilRetry } from './authUi'

function authValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    status: 'unauthenticated',
    session: null,
    startupError: null,
    sendCode: vi.fn().mockResolvedValue({
      accepted: true,
      retry_after_seconds: 60,
      message: '如果该手机号可用，验证码将很快发送。',
    }),
    loginCode: vi.fn().mockResolvedValue(undefined),
    loginPassword: vi.fn().mockResolvedValue(undefined),
    setPassword: vi.fn().mockResolvedValue(undefined),
    changePassword: vi.fn().mockResolvedValue(undefined),
    resetPassword: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function renderLogin(auth: AuthContextValue) {
  return render(<AuthContext.Provider value={auth}><LoginPage /></AuthContext.Provider>)
}

beforeEach(() => {
  vi.useRealTimers()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('mainland invite-only login', () => {
  it('shows fixed +86 without a country selector or public registration', () => {
    renderLogin(authValue())
    expect(screen.getByText('+86')).not.toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByText(/公开注册|立即注册|创建账号/)).toBeNull()
    expect(screen.getByRole('tab', { name: '验证码登录' })).not.toBeNull()
    expect(screen.getByRole('tab', { name: '密码登录' })).not.toBeNull()
  })

  it('switches between SMS and password login modes', () => {
    renderLogin(authValue())
    fireEvent.click(screen.getByRole('tab', { name: '密码登录' }))
    expect(screen.getByLabelText('登录密码')).not.toBeNull()
    expect(screen.getByRole('button', { name: '忘记密码' })).not.toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: '验证码登录' }))
    expect(screen.getByLabelText('六位短信验证码')).not.toBeNull()
  })

  it('starts the server-provided SMS cooldown countdown', async () => {
    vi.useFakeTimers()
    const auth = authValue()
    renderLogin(auth)
    fireEvent.change(screen.getByLabelText('中国大陆手机号'), { target: { value: '13812345678' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '获取验证码' }))
      await Promise.resolve()
    })
    expect(auth.sendCode).toHaveBeenCalledWith('13812345678', 'login')
    expect(screen.getByRole('button', { name: '60s' })).not.toBeNull()
    act(() => vi.advanceTimersByTime(1100))
    expect(screen.getByRole('button', { name: /5[89]s/ })).not.toBeNull()
  })

  it('submits SMS login with an eleven-digit phone and six-digit code', async () => {
    const auth = authValue()
    renderLogin(auth)
    fireEvent.change(screen.getByLabelText('中国大陆手机号'), { target: { value: '13812345678' } })
    fireEvent.change(screen.getByLabelText('六位短信验证码'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: '登录' }))
    await waitFor(() => expect(auth.loginCode).toHaveBeenCalledWith('13812345678', '123456'))
  })

  it('submits a successful password login', async () => {
    const auth = authValue()
    renderLogin(auth)
    fireEvent.click(screen.getByRole('tab', { name: '密码登录' }))
    fireEvent.change(screen.getByLabelText('中国大陆手机号'), { target: { value: '13812345678' } })
    fireEvent.change(screen.getByLabelText('登录密码'), { target: { value: 'password manager value' } })
    fireEvent.click(screen.getByRole('button', { name: '登录' }))
    await waitFor(() => {
      expect(auth.loginPassword).toHaveBeenCalledWith('13812345678', 'password manager value')
    })
  })

  it('submits password login and shows only the generic server error', async () => {
    const auth = authValue({
      loginPassword: vi.fn().mockRejectedValue(
        new ApiError('手机号或密码不正确。', { code: 'LOGIN_FAILED', status: 401 }),
      ),
    })
    renderLogin(auth)
    fireEvent.click(screen.getByRole('tab', { name: '密码登录' }))
    fireEvent.change(screen.getByLabelText('中国大陆手机号'), { target: { value: '13812345678' } })
    fireEvent.change(screen.getByLabelText('登录密码'), { target: { value: 'wrong-password' } })
    fireEvent.click(screen.getByRole('button', { name: '登录' }))
    await waitFor(() => expect(auth.loginPassword).toHaveBeenCalledWith('13812345678', 'wrong-password'))
    expect((await screen.findByRole('alert')).textContent).toContain('手机号或密码不正确')
    expect(document.body.textContent).not.toContain('未设置密码')
    expect(document.body.textContent).not.toContain('账号不存在')
  })

  it('supports forgot-password SMS reset and returns to password login', async () => {
    const auth = authValue()
    renderLogin(auth)
    fireEvent.click(screen.getByRole('tab', { name: '密码登录' }))
    fireEvent.click(screen.getByRole('button', { name: '忘记密码' }))
    fireEvent.change(screen.getByLabelText('中国大陆手机号'), { target: { value: '13812345678' } })
    fireEvent.change(screen.getByLabelText('重置密码验证码'), { target: { value: '654321' } })
    fireEvent.change(screen.getByLabelText('新密码'), { target: { value: 'new secure password' } })
    fireEvent.change(screen.getByLabelText('确认新密码'), { target: { value: 'new secure password' } })
    fireEvent.click(screen.getByRole('button', { name: '重置密码' }))
    await waitFor(() => {
      expect(auth.resetPassword).toHaveBeenCalledWith('13812345678', '654321', 'new secure password')
    })
    expect(screen.getByLabelText('登录密码')).not.toBeNull()
    expect(document.body.textContent).toContain('密码已重置')
  })
})

describe('auth UI utilities', () => {
  it('keeps only eleven phone digits', () => {
    expect(sanitizeMainlandPhoneInput('+86 138-1234-5678')).toBe('86138123456')
    expect(sanitizeMainlandPhoneInput('13812345678abc')).toBe('13812345678')
  })

  it('calculates a non-negative countdown', () => {
    expect(secondsUntilRetry(1_000, 60, 31_000)).toBe(30)
    expect(secondsUntilRetry(1_000, 60, 70_000)).toBe(0)
  })
})
