// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { invalidateAuthSession, purgeLegacyAuthStorage, readAuthSession } from '../api/authSession'
import { ensureAuthSession } from './authService'

afterEach(() => {
  invalidateAuthSession()
  vi.unstubAllGlobals()
})

describe('cookie auth session restoration', () => {
  it('removes the legacy localStorage bearer session', () => {
    window.localStorage.setItem('xuanos:auth-session:v1', JSON.stringify({ accessToken: 'legacy-secret' }))
    window.sessionStorage.setItem('xuanos:auth-session:v1', 'legacy-secret')
    purgeLegacyAuthStorage()
    expect(window.localStorage.getItem('xuanos:auth-session:v1')).toBeNull()
    expect(window.sessionStorage.getItem('xuanos:auth-session:v1')).toBeNull()
  })

  it('restores /auth/me with credentials and never persists a token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        user: {
          id: 'user-cookie',
          phone_masked: '138****5678',
          display_name: 'Cookie User',
          status: 'active',
          phone_verified: true,
          has_password: false,
        },
        expires_at: '2099-01-01T00:00:00Z',
        needs_password_setup: true,
      },
      meta: { request_id: 'req-test', next_cursor: null },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const restored = await ensureAuthSession()
    expect(restored.userId).toBe('user-cookie')
    expect(readAuthSession()?.phoneMasked).toBe('138****5678')
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ credentials: 'include' })
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
  })
})
