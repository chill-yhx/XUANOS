import { useEffect, useState, type FormEvent } from 'react'
import systemBackground from '../assets/system-background.png'
import { toApiErrorState } from '../api/apiErrors'
import { ParticleBackground } from '../components/ParticleBackground'
import { useAuth } from '../state/useAuth'
import { sanitizeMainlandPhoneInput, secondsUntilRetry } from './authUi'

type LoginMode = 'code' | 'password'
type LoginView = 'login' | 'reset'

export function LoginPage() {
  const auth = useAuth()
  const [mode, setMode] = useState<LoginMode>('code')
  const [view, setView] = useState<LoginView>('login')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(auth.startupError)
  const [retryStartedAt, setRetryStartedAt] = useState<number | null>(null)
  const [retrySeconds, setRetrySeconds] = useState(60)
  const [remaining, setRemaining] = useState(0)

  useEffect(() => {
    if (retryStartedAt === null) {
      setRemaining(0)
      return
    }
    const update = () => setRemaining(secondsUntilRetry(retryStartedAt, retrySeconds))
    update()
    const timer = window.setInterval(update, 250)
    return () => window.clearInterval(timer)
  }, [retrySeconds, retryStartedAt])

  const sendCode = async () => {
    if (phone.length !== 11 || busy || remaining > 0) return
    setBusy(true)
    setError(null)
    try {
      const result = await auth.sendCode(phone, view === 'reset' ? 'reset_password' : 'login')
      setRetrySeconds(result.retry_after_seconds)
      setRetryStartedAt(Date.now())
      setNotice(result.message)
    } catch (requestError) {
      setError(toApiErrorState(requestError).message)
    } finally {
      setBusy(false)
    }
  }

  const submitLogin = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || phone.length !== 11) return
    setBusy(true)
    setError(null)
    try {
      if (mode === 'code') {
        if (!/^\d{6}$/.test(code)) {
          setError('请输入六位验证码。')
          return
        }
        await auth.loginCode(phone, code)
      } else {
        if (!password) {
          setError('请输入密码。')
          return
        }
        await auth.loginPassword(phone, password)
      }
    } catch (requestError) {
      setError(toApiErrorState(requestError).message)
    } finally {
      setBusy(false)
    }
  }

  const submitReset = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || phone.length !== 11) return
    if (!/^\d{6}$/.test(code)) {
      setError('请输入六位验证码。')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('两次输入的密码不一致。')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await auth.resetPassword(phone, code, newPassword)
      setView('login')
      setMode('password')
      setPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setCode('')
      setNotice('密码已重置，请使用新密码登录。')
    } catch (requestError) {
      setError(toApiErrorState(requestError).message)
    } finally {
      setBusy(false)
    }
  }

  const phoneField = (
    <label className="auth-field">
      <span>中国大陆手机号</span>
      <span className="auth-phone-input">
        <strong>+86</strong>
        <input
          aria-label="中国大陆手机号"
          autoComplete="tel-national"
          inputMode="numeric"
          maxLength={11}
          placeholder="13812345678"
          value={phone}
          onChange={(event) => setPhone(sanitizeMainlandPhoneInput(event.target.value))}
        />
      </span>
    </label>
  )

  return (
    <main className="auth-screen">
      <div className="space-depth" />
      <div className="ambient-art" style={{ backgroundImage: `url(${systemBackground})` }} />
      <div className="ambient-veil" />
      <ParticleBackground />
      <section className="auth-stage" aria-label="XUANOS 登录">
        <header className="auth-brand">
          <span className="auth-brand-mark">X</span>
          <div>
            <strong>XUANOS</strong>
            <small>HUMAN GROWTH OS</small>
          </div>
        </header>

        <div className="auth-panel">
          <div className="eyebrow">INVITED ACCESS</div>
          <h1>{view === 'reset' ? '重置登录密码' : '进入你的系统'}</h1>
          <p>{view === 'reset' ? '通过已验证手机号重置密码。' : '仅限已受邀的中国大陆手机号。'}</p>

          {view === 'login' ? (
            <>
              <div className="auth-mode-switch" role="tablist" aria-label="登录方式">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'code'}
                  className={mode === 'code' ? 'is-active' : ''}
                  onClick={() => { setMode('code'); setError(null) }}
                >
                  验证码登录
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'password'}
                  className={mode === 'password' ? 'is-active' : ''}
                  onClick={() => { setMode('password'); setError(null) }}
                >
                  密码登录
                </button>
              </div>

              <form className="auth-form" onSubmit={submitLogin}>
                {phoneField}
                {mode === 'code' ? (
                  <label className="auth-field">
                    <span>短信验证码</span>
                    <span className="auth-code-input">
                      <input
                        aria-label="六位短信验证码"
                        autoComplete="one-time-code"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="六位数字"
                        value={code}
                        onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                      />
                      <button type="button" disabled={busy || phone.length !== 11 || remaining > 0} onClick={sendCode}>
                        {remaining > 0 ? `${remaining}s` : '获取验证码'}
                      </button>
                    </span>
                  </label>
                ) : (
                  <label className="auth-field">
                    <span>登录密码</span>
                    <input
                      aria-label="登录密码"
                      autoComplete="current-password"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  </label>
                )}
                {error && <div className="auth-message is-error" role="alert">{error}</div>}
                {notice && !error && <div className="auth-message">{notice}</div>}
                <button className="auth-submit" type="submit" disabled={busy || phone.length !== 11}>
                  {busy ? '验证中' : '登录'}
                </button>
                {mode === 'password' && (
                  <button className="auth-text-action" type="button" onClick={() => { setView('reset'); setError(null) }}>
                    忘记密码
                  </button>
                )}
              </form>
            </>
          ) : (
            <form className="auth-form" onSubmit={submitReset}>
              {phoneField}
              <label className="auth-field">
                <span>重置验证码</span>
                <span className="auth-code-input">
                  <input
                    aria-label="重置密码验证码"
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  />
                  <button type="button" disabled={busy || phone.length !== 11 || remaining > 0} onClick={sendCode}>
                    {remaining > 0 ? `${remaining}s` : '获取验证码'}
                  </button>
                </span>
              </label>
              <label className="auth-field">
                <span>新密码</span>
                <input
                  aria-label="新密码"
                  autoComplete="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
              </label>
              <label className="auth-field">
                <span>确认新密码</span>
                <input
                  aria-label="确认新密码"
                  autoComplete="new-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </label>
              {error && <div className="auth-message is-error" role="alert">{error}</div>}
              {notice && !error && <div className="auth-message">{notice}</div>}
              <button className="auth-submit" type="submit" disabled={busy || phone.length !== 11}>
                {busy ? '提交中' : '重置密码'}
              </button>
              <button className="auth-text-action" type="button" onClick={() => { setView('login'); setError(null) }}>
                返回登录
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  )
}
