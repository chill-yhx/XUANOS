const STORAGE_KEY = 'xuanos:demo-user:idempotency:v1'

interface PendingIdempotency {
  key: string
  fingerprint: string
  createdAt: string
}

type PendingStore = Record<string, PendingIdempotency>

function readStore(): PendingStore {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed as PendingStore : {}
  } catch {
    return {}
  }
}

function writeStore(store: PendingStore) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // In-memory request deduplication still protects the current interaction.
  }
}

function generateKey(operation: string) {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `xuanos-${operation}-${suffix}`
}

export function getOrCreateIdempotencyKey(operation: string, payload: unknown): string {
  const store = readStore()
  const fingerprint = JSON.stringify(payload)
  const pending = store[operation]
  if (pending?.fingerprint === fingerprint) return pending.key

  const key = generateKey(operation)
  store[operation] = { key, fingerprint, createdAt: new Date().toISOString() }
  writeStore(store)
  return key
}

export function clearIdempotencyKey(operation: string, key: string) {
  const store = readStore()
  if (store[operation]?.key !== key) return
  delete store[operation]
  writeStore(store)
}
