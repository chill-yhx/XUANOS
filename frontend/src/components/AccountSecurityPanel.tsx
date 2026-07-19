import { useState } from 'react'
import { toApiErrorState } from '../api/apiErrors'
import { useAuth } from '../state/useAuth'
import { GlassPanel } from './GlassPanel'
import { PrimaryButton } from './PrimaryButton'
import { SecondaryButton } from './SecondaryButton'
import { Tag } from './Tag'

export function AccountSecurityPanel() {
  const auth = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const hasPassword = auth.session?.hasPassword ?? false

  const submit = async () => {
    if (busy) return
    if (newPassword !== confirmation) {
      setError('两次输入的密码不一致。')
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      if (hasPassword) await auth.changePassword(currentPassword, newPassword)
      else await auth.setPassword(newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmation('')
      setMessage(hasPassword ? '登录密码已更新，其他旧会话已失效。' : '登录密码已设置。以后可自由选择两种登录方式。')
    } catch (requestError) {
      setError(toApiErrorState(requestError).message)
    } finally {
      setBusy(false)
    }
  }

  const logout = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await auth.logout()
    } catch (requestError) {
      setError(toApiErrorState(requestError).message)
      setBusy(false)
    }
  }

  return (
    <GlassPanel
      variant="ghost"
      className="account-security-panel"
      eyebrow="ACCOUNT SECURITY"
      title="账号与登录"
      action={<Tag tone={hasPassword ? 'success' : 'impact'}>{hasPassword ? 'PASSWORD READY' : 'SMS ONLY'}</Tag>}
    >
      <div className="account-identity-line">
        <div><span className="metric-label">PHONE</span><strong>{auth.session?.phoneMasked ?? '未同步'}</strong></div>
        <div><span className="metric-label">DISPLAY NAME</span><strong>{auth.session?.displayName ?? 'XUANOS 用户'}</strong></div>
      </div>
      {!hasPassword && <p className="account-security-note">手机号已经验证。现在可以设置密码，也可以继续只使用短信验证码登录。</p>}
      <div className="account-password-grid">
        {hasPassword && (
          <label className="auth-field">
            <span>当前密码</span>
            <input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
          </label>
        )}
        <label className="auth-field">
          <span>{hasPassword ? '新密码' : '设置密码'}</span>
          <input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
        </label>
        <label className="auth-field">
          <span>确认密码</span>
          <input type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
        </label>
      </div>
      {error && <div className="auth-message is-error" role="alert">{error}</div>}
      {message && <div className="auth-message">{message}</div>}
      <div className="button-row">
        <PrimaryButton disabled={busy || !newPassword || !confirmation || (hasPassword && !currentPassword)} onClick={() => void submit()}>
          {busy ? '保存中' : hasPassword ? '修改密码' : '设置密码'}
        </PrimaryButton>
        <SecondaryButton disabled={busy} onClick={() => void logout()}>退出登录</SecondaryButton>
      </div>
    </GlassPanel>
  )
}
