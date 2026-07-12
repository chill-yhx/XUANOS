import { useEffect } from 'react'
import type { PageId } from '../types'
import { FeedbackForm } from '../components/FeedbackForm'
import { GlassPanel } from '../components/GlassPanel'
import { PrimaryButton } from '../components/PrimaryButton'
import { SecondaryButton } from '../components/SecondaryButton'
import { Tag } from '../components/Tag'
import { WarningBanner } from '../components/WarningBanner'
import { useInteraction } from '../state/useInteraction'

interface PageProps {
  onNavigate: (page: PageId) => void
}

export function FeedbackPage({ onNavigate }: PageProps) {
  const { state, dispatch } = useInteraction()
  const plan = state.currentPlan

  useEffect(() => {
    if (state.currentStep !== 'feedback_submitted') return
    const timer = window.setTimeout(() => dispatch({ type: 'APPLY_SYSTEM_REVISION' }), 550)
    return () => window.clearTimeout(timer)
  }, [dispatch, state.currentStep])

  if (!plan || plan.status !== 'accepted') {
    return (
      <section className="page">
        <WarningBanner tone="impact">请先确认计划，再进入行动反馈。</WarningBanner>
        <div className="button-row"><PrimaryButton onClick={() => onNavigate('plan')}>返回计划裁决</PrimaryButton></div>
      </section>
    )
  }

  const submitted = state.currentStep === 'feedback_submitted' || state.currentStep === 'system_revised'

  return (
    <section className="page">
      <header className="page-heading">
        <div>
          <div className="eyebrow">ACTION EXECUTION</div>
          <h1>行动反馈</h1>
        </div>
        <p className="page-heading-copy">记录真实结果。系统根据行动修正，而不是根据想象。</p>
      </header>

      <div className="feedback-layout">
        <GlassPanel variant="secondary" eyebrow="RESULT INPUT" title={submitted ? '反馈已提交' : '记录真实结果'}>
          {state.currentStep === 'feedback_submitted' && (
            <div className="revision-loading"><span className="status-pulse" />正在根据行动结果修正系统</div>
          )}
          {state.currentStep === 'system_revised' && (
            <div className="feedback-helper">本次反馈：{state.actionFeedback.progress}% 完成，最大阻力代码为“{state.actionFeedback.obstacleCode}”。</div>
          )}
          {state.currentStep === 'action_pending' && (
            <FeedbackForm
              value={state.actionFeedback}
              onChange={(value) => dispatch({ type: 'UPDATE_FEEDBACK_DRAFT', value })}
              onSubmit={() => dispatch({ type: 'SUBMIT_FEEDBACK' })}
            />
          )}
        </GlassPanel>

        <aside className="feedback-summary">
          <GlassPanel variant="ghost" eyebrow="CURRENT ACTION" title={plan.singleAction}>
            <div className="mini-metric"><span className="metric-label">当前唯一行动</span><span>{plan.singleAction}</span></div>
            <div className="mini-metric"><span className="metric-label">完成标准</span><span>{plan.completionStandard}</span></div>
          </GlassPanel>
        </aside>
      </div>

      {state.currentStep === 'system_revised' && state.systemRevision && (
        <GlassPanel variant="primary" className="system-notice" eyebrow="SYSTEM REVISION" title="系统修正">
          <div className="revision-flow">
            <div className="revision-step"><span className="metric-label">原判断</span><p>{state.systemRevision.originalJudgment}</p></div>
            <div className="revision-step"><span className="metric-label">实际结果</span><p>{state.systemRevision.actualResult}</p></div>
            <div className="revision-step"><span className="metric-label">系统修正</span><p>{state.systemRevision.revisedJudgment}</p></div>
            <div className="revision-step"><span className="metric-label">下一步调整</span><p>{state.systemRevision.nextAdjustment}</p></div>
          </div>
          <WarningBanner tone="gold">我的系统已经因为这次反馈发生变化。</WarningBanner>
          <div className="button-row">
            <PrimaryButton onClick={() => onNavigate('system')}>查看我的系统</PrimaryButton>
            <SecondaryButton onClick={() => onNavigate('plan')}>查看计划版本</SecondaryButton>
            <Tag tone="success">已修正</Tag>
          </div>
        </GlassPanel>
      )}
    </section>
  )
}
