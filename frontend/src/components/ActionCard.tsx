import { PrimaryButton } from './PrimaryButton'
import { Tag } from './Tag'

interface ActionCardProps {
  onPrimary?: () => void
  primaryLabel?: string
  action?: string
  completion?: string
  workload?: string
}

export function ActionCard({
  onPrimary,
  primaryLabel = '进入行动反馈',
  action = '完成五个页面线框',
  completion = '五个核心页面具备可交付线框',
  workload = '中等',
}: ActionCardProps) {
  return (
    <section className="action-card">
      <div className="eyebrow">NEXT ACTION</div>
      <h2>{action}</h2>
      <div className="action-details">
        <div>
          <span className="metric-label">完成标准</span>
          <span>{completion}</span>
        </div>
        <div>
          <span className="metric-label">预计负荷</span>
          <span><Tag tone="gold">{workload}</Tag></span>
        </div>
      </div>
      {onPrimary && <div className="button-row"><PrimaryButton onClick={onPrimary}>{primaryLabel}</PrimaryButton></div>}
    </section>
  )
}
