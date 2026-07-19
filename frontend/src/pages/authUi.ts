export function secondsUntilRetry(retryStartedAt: number, retrySeconds: number, now = Date.now()) {
  return Math.max(0, Math.ceil((retryStartedAt + retrySeconds * 1000 - now) / 1000))
}

export function sanitizeMainlandPhoneInput(value: string) {
  return value.replace(/\D/g, '').slice(0, 11)
}
