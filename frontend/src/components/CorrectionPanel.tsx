import type { PlanModificationReason } from '../types'
import { PrimaryButton } from './PrimaryButton'
import { SecondaryButton } from './SecondaryButton'
import { WarningBanner } from './WarningBanner'

const reasons: Array<{ code: PlanModificationReason; label: string }> = [
  { code: 'time_conflict', label: '时间冲突' },
  { code: 'resource_limit', label: '资源限制' },
  { code: 'ability_limit', label: '能力限制' },
  { code: 'health_or_safety', label: '身体或安全原因' },
  { code: 'personal_preference', label: '个人偏好' },
  { code: 'reject_system_judgment', label: '不认可系统判断' },
  { code: 'other', label: '其他' },
]

interface CorrectionPanelProps {
  systemRecommendation: string
  reason: PlanModificationReason | null
  userChoice: string
  expectedImpactAcknowledged: boolean
  isLoading?: boolean
  onChange: (value: {
    reason?: PlanModificationReason
    userChoice?: string
    expectedImpactAcknowledged?: boolean
  }) => void
  onConfirm: () => void
  onClose: () => void
}

export function CorrectionPanel({
  systemRecommendation,
  reason,
  userChoice,
  expectedImpactAcknowledged,
  isLoading = false,
  onChange,
  onConfirm,
  onClose,
}: CorrectionPanelProps) {
  return (
    <section className="correction-panel">
      <div>
        <div className="eyebrow">PLAN CORRECTION</div>
        <p className="panel-description">先记录修改原因，再保留系统建议与用户最终选择。</p>
      </div>
      <div className="correction-comparison">
        <div>
          <span className="metric-label">系统原建议</span>
          <p>{systemRecommendation}</p>
        </div>
        <div>
          <span className="metric-label">用户最终选择</span>
          <textarea
            className="short-input"
            value={userChoice}
            onChange={(event) => onChange({ userChoice: event.target.value })}
            disabled={isLoading}
          />
        </div>
      </div>
      <div className="modification-reasons" aria-label="修改原因">
        {reasons.map((item) => (
          <button
            key={item.code}
            type="button"
            className={`choice-button ${reason === item.code ? 'is-active' : ''}`}
            onClick={() => onChange({ reason: item.code })}
            disabled={isLoading}
          >
            {item.label}
          </button>
        ))}
      </div>
      <WarningBanner tone="impact">预计影响：范围或完成时间可能变化。此部分为用户最终选择，并非 XUANOS 当前首选建议。</WarningBanner>
      <label className="impact-acknowledgement">
        <input
          type="checkbox"
          checked={expectedImpactAcknowledged}
          onChange={(event) => onChange({ expectedImpactAcknowledged: event.target.checked })}
          disabled={isLoading}
        />
        <span>我已了解预计影响与复查条件</span>
      </label>
      <div className="button-row">
        <PrimaryButton
          disabled={!reason || !userChoice.trim() || !expectedImpactAcknowledged || isLoading}
          onClick={onConfirm}
        >
          {isLoading ? '正在生成新版本' : '保存为新版本'}
        </PrimaryButton>
        <SecondaryButton onClick={onClose} disabled={isLoading}>取消修改</SecondaryButton>
      </div>
    </section>
  )
}
