import { readAuthSession } from './authSession'

const STORAGE_PREFIX = 'xuanos:idempotency:v3'
const LEGACY_STORAGE_PREFIX = 'xuanos:idempotency:v2'

interface PendingIdempotency {
  key: string
  fingerprint: string
  createdAt: string
}

type PendingStore = Record<string, PendingIdempotency>

function storageKey(threadId: string | null, userId = readAuthSession()?.userId): string | null {
  return userId ? `${STORAGE_PREFIX}:${userId}:${threadId ?? 'user'}` : null
}

function readStore(threadId: string | null): PendingStore {
  try {
    const key = storageKey(threadId)
    if (!key) return {}
    const raw = window.localStorage.getItem(key)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed as PendingStore : {}
  } catch {
    return {}
  }
}

function writeStore(threadId: string | null, store: PendingStore) {
  try {
    const key = storageKey(threadId)
    if (!key) return
    window.localStorage.setItem(key, JSON.stringify(store))
  } catch {
    // In-memory request deduplication still protects the current interaction.
  }
}

function generateKey(operation: string) {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `xuanos-${operation}-${suffix}`
}

export function getOrCreateIdempotencyKey(
  operation: string,
  payload: unknown,
  threadId: string | null = null,
): string {
  const store = readStore(threadId)
  const fingerprint = JSON.stringify(payload)
  const pending = store[operation]
  if (pending?.fingerprint === fingerprint) return pending.key

  const key = generateKey(operation)
  store[operation] = { key, fingerprint, createdAt: new Date().toISOString() }
  writeStore(threadId, store)
  return key
}

export function clearIdempotencyKey(operation: string, key: string, threadId: string | null = null) {
  const store = readStore(threadId)
  if (store[operation]?.key !== key) return
  delete store[operation]
  writeStore(threadId, store)
}

export function clearIdempotencyStore(userId: string | null) {
  if (!userId) return
  try {
    const keys = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
      .filter((key): key is string => Boolean(key))
      .filter((key) => key.startsWith(`${STORAGE_PREFIX}:${userId}:`)
        || key === `${LEGACY_STORAGE_PREFIX}:${userId}`)
    keys.forEach((key) => window.localStorage.removeItem(key))
  } catch {
    // An invalid session is still removed even if browser storage is unavailable.
  }
}
