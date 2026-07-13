import { apiData } from '../api/apiClient'
import { readAuthSession, writeAuthSession, type StoredAuthSession } from '../api/authSession'
import type { AuthSessionDto } from '../api/dto'

let sessionRequest: Promise<StoredAuthSession> | null = null

function mapSession(dto: AuthSessionDto): StoredAuthSession {
  return {
    accessToken: dto.access_token,
    userId: dto.user_id,
    expiresAt: dto.expires_at,
  }
}

export async function ensureAuthSession(): Promise<StoredAuthSession> {
  const current = readAuthSession()
  if (current) return current
  if (sessionRequest) return sessionRequest

  sessionRequest = (async () => {
    const dto = await apiData<AuthSessionDto>('/api/sessions', {
      method: 'POST',
      requiresAuth: false,
    })
    const session = mapSession(dto)
    writeAuthSession(session)
    return session
  })()
  try {
    return await sessionRequest
  } finally {
    sessionRequest = null
  }
}
