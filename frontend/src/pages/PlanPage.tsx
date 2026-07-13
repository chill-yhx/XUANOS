import { useState } from 'react'
import type { PageId, PriorityGroup } from '../types'
import { ActionCard } from '../components/ActionCard'
import { CorrectionPanel } from '../components/CorrectionPanel'
import { GlassPanel } from '../components/GlassPanel'
import { GoalPriorityCard } from '../components/GoalPriorityCard'
import { PlanDecisionCard } from '../components/PlanDecisionCard'
import { PrimaryButton } from '../components/PrimaryButton'
import { SecondaryButton } from '../components/SecondaryButton'
import { TimeBlockPlan } from '../components/TimeBlockPlan'
import { WarningBanner } from '../components/WarningBanner'
import { useInteraction } from '../state/useInteraction'

interface PageProps {
  onNavigate: (page: PageId) => void
}

export function PlanPage({ onNavigate }: PageProps) {
  const { state, dispatch } = useInteraction()
  const [showCorrection, setShowCorrection] = useState(false)
  const plan = state.currentPlan

  if (!plan) {
    return (
      <section className="page page-stack">
        <WarningBanner tone="impact">理解尚未确认，当前不能生成计划。</WarningBanner>
        <div><PrimaryButton onClick={() => onNavigate('understanding')}>返回引导式理解</PrimaryButton></div>
      </section>
    )
  }

  const priorityGroups: PriorityGroup[] = [
    { title: '维持目标', label: 'KEEP', tone: 'success', items: plan.maintenanceGoals },
    { title: '暂停目标', label: 'PAUSE', tone: 'impact', items: plan.pausedGoals },
    { title: '删除事项', label: 'REMOVE', tone: 'risk', items: plan.removedItems },
  ]
  const accepted = plan.status === 'accepted'

  const enterAction = () => {
    dispatch({ type: 'START_ACTION' })
    onNavigate('feedback')
  }

  return (
    <section className="page page-stack">
      <header className="page-heading">
        <div>
          <div className="eyebrow">PLAN DECISION · MOCK · V{plan.version}</div>
          <h1>计划裁决</h1>
        </div>
        <p className="page-heading-copy">明确保留、暂停和删除。每次修改都留下版本。</p>
      </header>

      <WarningBanner tone="gold">当前计划裁决仍由前端 Mock 规则生成，尚未接入计划 API。</WarningBanner>

      <PlanDecisionCard plan={plan} />

      <section className="priority-grid" aria-label="目标取舍">
        {priorityGroups.map((group) => <GoalPriorityCard key={group.title} group={group} />)}
      </section>

      <details className="plan-disclosure" open={accepted}>
        <summary>展开时段、行动与复查</summary>
        <div className="plan-disclosure-content">
          <GlassPanel variant="secondary" eyebrow="TIME BLOCKS" title="今日时段">
            <TimeBlockPlan />
          </GlassPanel>

          <ActionCard
            action={plan.singleAction}
            completion={plan.completionStandard}
            workload={plan.workload}
            onPrimary={accepted ? enterAction : undefined}
            primaryLabel="进入行动反馈"
          />

          <GlassPanel variant="ghost" eyebrow="DECISION BOUNDS" title="影响与复查">
            <div className="metric-grid">
              <div><span className="metric-label">系统原建议</span><span>{plan.systemRecommendation}</span></div>
              <div><span className="metric-label">预计影响</span><span>{plan.expectedImpact || '保持当前范围，先验证完整闭环。'}</span></div>
              <div><span className="metric-label">复查条件</span><span>{plan.reviewCondition}</span></div>
            </div>
          </GlassPanel>
        </div>
      </details>

      {plan.isUserFinalChoice && (
        <WarningBanner tone="impact">此部分为用户最终选择，并非 XUANOS 当前首选建议。</WarningBanner>
      )}

      {showCorrection && (
        <CorrectionPanel
          systemRecommendation={plan.systemRecommendation}
          currentAction={plan.singleAction}
          onClose={() => setShowCorrection(false)}
          onConfirm={(reason, userChoice) => {
            dispatch({ type: 'MODIFY_PLAN', reason, userChoice })
            setShowCorrection(false)
          }}
        />
      )}

      <details className="plan-version-history">
        <summary>计划版本 · {state.planVersions.length}</summary>
        <div className="version-list">
          {state.planVersions.map((version) => (
            <div className="version-item" key={version.id}>
              <span>V{version.version}</span>
              <strong>{version.singleAction}</strong>
              <small>{version.status === 'accepted' ? '当前接受' : version.status === 'superseded' ? '历史版本' : '等待确认'}</small>
            </div>
          ))}
        </div>
      </details>

      {accepted && <WarningBanner tone="gold">计划 V{plan.version} 已接受。当前唯一行动已经写入系统快照。</WarningBanner>}

      <div className="plan-actions">
        <div className="plan-actions-left">
          <SecondaryButton onClick={() => setShowCorrection(true)}>修改计划</SecondaryButton>
          <SecondaryButton onClick={() => setShowCorrection(true)}>我不同意这个判断</SecondaryButton>
        </div>
        <div className="plan-actions-right">
          <SecondaryButton onClick={() => { dispatch({ type: 'REOPEN_QUESTIONS' }); onNavigate('understanding') }}>重新回答问题</SecondaryButton>
          {accepted
            ? <PrimaryButton onClick={enterAction}>进入行动</PrimaryButton>
            : <PrimaryButton onClick={() => dispatch({ type: 'ACCEPT_PLAN' })}>接受计划</PrimaryButton>}
        </div>
      </div>
    </section>
  )
}
