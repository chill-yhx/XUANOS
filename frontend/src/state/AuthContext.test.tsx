// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { invalidateAuthSession } from '../api/authSession'
import { AuthProvider } from './AuthContext'
import { useAuth } from './useAuth'

function envelope(data: unknown) {
  return JSON.stringify({ data, meta: { request_id: 'req-auth-context', next_cursor: null } })
}

function sessionDto() {
  return {
    user: {
      id: 'user-restored',
      phone_masked: '138****5678',
      display_name: '恢复用户',
      status: 'active',
      phone_verified: true,
      has_password: true,
    },
    expires_at: '2099-01-01T00:00:00Z',
    needs_password_setup: false,
  }
}

function Probe() {
  const auth = useAuth()
  return (
    <div>
      <span data-testid="status">{auth.status}</span>
      <span data-testid="user">{auth.session?.userId ?? 'none'}</span>
      <button type="button" onClick={() => void auth.logout()}>退出</button>
    </div>
  )
}

afterEach(() => {
  cleanup()
  invalidateAuthSession()
  vi.unstubAllGlobals()
})

describe('AuthProvider', () => {
  it('restores a Cookie Session after refresh and logs out through the server', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(envelope(sessionDto()), { status: 200 }))
      .mockResolvedValueOnce(new Response(envelope({ completed: true, message: '已退出登录。' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'))
    expect(screen.getByTestId('user').textContent).toBe('user-restored')

    fireEvent.click(screen.getByRole('button', { name: '退出' }))
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('unauthenticated'))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
