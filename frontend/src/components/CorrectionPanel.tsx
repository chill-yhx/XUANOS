import { useState } from 'react'
import type { PlanModificationReason } from '../types'
import { PrimaryButton } from './PrimaryButton'
import { SecondaryButton } from './SecondaryButton'
import { WarningBanner } from './WarningBanner'

const reasons: PlanModificationReason[] = [
  '时间冲突', '资源限制', '能力限制', '身体或安全原因',
  '个人偏好', '不认可系统判断', '其他',
]

interface CorrectionPanelProps {
  systemRecommendation: string
  currentAction: string
  onConfirm: (reason: PlanModificationReason, userChoice: string) => void
  onClose: () => void
}

export function CorrectionPanel({ systemRecommendation, currentAction, onConfirm, onClose }: CorrectionPanelProps) {
  const [reason, setReason] = useState<PlanModificationReason | null>(null)
  const [userChoice, setUserChoice] = useState(currentAction)

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
          <textarea className="short-input" value={userChoice} onChange={(event) => setUserChoice(event.target.value)} />
        </div>
      </div>
      <div className="modification-reasons" aria-label="修改原因">
        {reasons.map((item) => (
          <button key={item} type="button" className={`choice-button ${reason === item ? 'is-active' : ''}`} onClick={() => setReason(item)}>{item}</button>
        ))}
      </div>
      <WarningBanner tone="impact">预计影响：范围或完成时间可能变化。此部分为用户最终选择，并非 XUANOS 当前首选建议。</WarningBanner>
      <div className="button-row">
        <PrimaryButton disabled={!reason || !userChoice.trim()} onClick={() => reason && onConfirm(reason, userChoice)}>保存为新版本</PrimaryButton>
        <SecondaryButton onClick={onClose}>取消修改</SecondaryButton>
      </div>
    </section>
  )
}
