import type { PlanVersion } from '../types'
import { GlassPanel } from './GlassPanel'
import { Tag } from './Tag'

export function PlanDecisionCard({ plan }: { plan: PlanVersion }) {
  return (
    <GlassPanel className="decision-panel" eyebrow="PRIMARY VECTOR" title="主目标裁决">
      <div className="decision-title">{plan.mainGoal}</div>
      <div className="decision-facts">
        <div>
          <span className="metric-label">裁决原因</span>
          <span>{plan.systemRecommendation}</span>
        </div>
        <div>
          <span className="metric-label">当前阶段</span>
          <span><Tag tone="gold">{plan.stage}</Tag></span>
        </div>
        <div>
          <span className="metric-label">主要风险</span>
          <span>{plan.isUserFinalChoice ? '用户选择与系统首选不同' : '继续扩展范围会推迟闭环验证'}</span>
        </div>
      </div>
    </GlassPanel>
  )
}
