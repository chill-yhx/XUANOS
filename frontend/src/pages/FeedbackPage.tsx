import { actionObstacleOptions, actionResultOptions } from '../data/actionFeedbackOptions'
import type { PageId } from '../types'
import { FeedbackForm } from '../components/FeedbackForm'
import { GlassPanel } from '../components/GlassPanel'
import { PrimaryButton } from '../components/PrimaryButton'
import { SecondaryButton } from '../components/SecondaryButton'
import { SnapshotDiffPanel } from '../components/SnapshotDiffPanel'
import { Tag } from '../components/Tag'
import { WarningBanner } from '../components/WarningBanner'
import { useInteraction } from '../state/useInteraction'

interface PageProps {
  onNavigate: (page: PageId) => void
}

const resultLabels = Object.fromEntries(actionResultOptions.map((item) => [item.code, item.label]))
const obstacleLabels = Object.fromEntries(actionObstacleOptions.map((item) => [item.code, item.label]))

export function FeedbackPage({ onNavigate }: PageProps) {
  const {
    state,
    dispatch,
    submitCurrentActionResult,
    refreshActiveThread,
  } = useInteraction()
  const plan = state.currentPlan

  if (!state.activeThreadId || !plan || plan.status !== 'accepted' || !state.activePlanId) {
    return (
      <section className="page">
        <WarningBanner tone="impact">请先接受真实服务端计划，再进入行动反馈。</WarningBanner>
        <div className="button-row"><PrimaryButton onClick={() => onNavigate('plan')}>返回计划裁决</PrimaryButton></div>
      </section>
    )
  }

  const isLoading = state.actionResultRequestStatus === 'loading'
  const isSyncing = isLoading || state.planRequestStatus === 'loading' || state.isLoading
  const isOffline = state.isOfflineCache || state.planSource !== 'api'
  const result = state.latestActionResult
  const diff = state.snapshotDiff
  const latestSnapshot = state.latestSnapshot ?? state.serverSnapshot
  const previousHypothesis = state.previousSnapshot?.hypotheses.find(
    (item) => item.id === state.latestActionHypothesis?.id,
  )
  const sourceTag = state.actionResultSource === 'api'
    ? <Tag tone="success">SERVER RESULT</Tag>
    : state.actionResultSource === 'cache'
      ? <Tag tone="impact">OFFLINE CACHE</Tag>
      : <Tag tone="muted">NO SERVER RESULT</Tag>

  return (
    <section className="page page-stack">
      <header className="page-heading">
        <div>
          <div className="eyebrow">ACTION EXECUTION</div>
          <h1>行动反馈</h1>
        </div>
        <div className="plan-source-meta">
          {sourceTag}
          {state.actionResultSubmittedAt && <span>{new Date(state.actionResultSubmittedAt).toLocaleString()}</span>}
        </div>
      </header>

      {isOffline && (
        <WarningBanner tone="impact">
          当前处于离线缓存。反馈草稿会保留，但恢复服务前不能提交新的行动结果。
        </WarningBanner>
      )}
      {state.actionResultApiError && (
        <WarningBanner tone={state.actionResultRequestStatus === 'success' ? 'gold' : 'impact'}>
          {state.actionResultRequestStatus === 'success'
            ? '行动结果已保存，线程聚合状态等待重新同步。'
            : state.actionResultApiError.message}
        </WarningBanner>
      )}
      {(isOffline || state.actionResultApiError) && (
        <div>
          <SecondaryButton onClick={() => void refreshActiveThread()} disabled={isSyncing}>
            {isSyncing ? '正在重新连接' : '同步服务端状态'}
          </SecondaryButton>
        </div>
      )}

      <div className="feedback-layout">
        <GlassPanel
          variant="secondary"
          eyebrow="RESULT INPUT"
          title={state.currentStep === 'system_revised' && result ? '服务端结果已记录' : '记录真实结果'}
        >
          {state.currentStep === 'plan_accepted' && (
            <div className="action-ready-state">
              <p>计划已接受。开始记录这次行动的真实结果。</p>
              <PrimaryButton onClick={() => dispatch({ type: 'START_ACTION' })} disabled={isOffline}>
                开始记录
              </PrimaryButton>
            </div>
          )}
          {state.currentStep === 'action_pending' && (
            <FeedbackForm
              value={state.actionFeedback}
              onChange={(value) => dispatch({ type: 'UPDATE_FEEDBACK_DRAFT', value })}
              onSubmit={() => void submitCurrentActionResult()}
              isLoading={isLoading}
              disabled={isOffline || isSyncing && !isLoading}
            />
          )}
          {isLoading && (
            <div className="request-state"><span className="status-pulse" />正在写入行动结果并更新系统</div>
          )}
          {state.currentStep === 'system_revised' && result && (
            <div className="submitted-result-summary">
              <div><span className="metric-label">行动结果</span><strong>{resultLabels[result.resultStatus]}</strong></div>
              <div><span className="metric-label">实际用时</span><strong>{result.actualDurationMinutes ?? 0} 分钟</strong></div>
              <div><span className="metric-label">最大阻力</span><strong>{obstacleLabels[result.obstacleCode] ?? result.obstacleCode}</strong></div>
              <div><span className="metric-label">结果 ID</span><code>{result.id}</code></div>
            </div>
          )}
        </GlassPanel>

        <aside className="feedback-summary">
          <GlassPanel variant="ghost" eyebrow="CURRENT ACTION" title={plan.singleAction}>
            <div className="mini-metric"><span className="metric-label">当前唯一行动</span><span>{plan.singleAction}</span></div>
            <div className="mini-metric"><span className="metric-label">完成标准</span><span>{plan.completionStandard}</span></div>
            <div className="mini-metric"><span className="metric-label">行动标识</span><span>{state.actionFeedback.actionIdentifier ?? plan.id}</span></div>
          </GlassPanel>
        </aside>
      </div>

      {state.currentStep === 'system_revised' && result && state.systemRevision && latestSnapshot && (
        <>
          <GlassPanel variant="primary" className="system-notice" eyebrow="SYSTEM REVISION · SERVER RESULT" title="系统修正">
            <div className="revision-flow">
              <div className="revision-step"><span className="metric-label">原判断</span><p>{state.systemRevision.originalJudgment}</p></div>
              <div className="revision-step"><span className="metric-label">实际结果</span><p>{state.systemRevision.actualResult}</p></div>
              <div className="revision-step"><span className="metric-label">系统修正</span><p>{state.systemRevision.revisedJudgment}</p></div>
              <div className="revision-step"><span className="metric-label">下一步调整</span><p>{state.systemRevision.nextAdjustment}</p></div>
            </div>
            <div className="snapshot-version-line">
              <span>SNAPSHOT V{latestSnapshot.version}</span>
              <span>{latestSnapshot.createdAt ? new Date(latestSnapshot.createdAt).toLocaleString() : ''}</span>
            </div>
          </GlassPanel>

          <GlassPanel variant="secondary" eyebrow="HYPOTHESIS UPDATE" title="判断变化">
            <div className="hypothesis-comparison">
              <div><span className="metric-label">更新前</span><p>{previousHypothesis ? `${previousHypothesis.content} · ${previousHypothesis.status}` : '上一版快照未保留该判断'}</p></div>
              <div><span className="metric-label">更新后</span><p>{state.latestActionHypothesis ? `${state.latestActionHypothesis.content} · ${state.latestActionHypothesis.status}` : '本次未返回判断更新'}</p></div>
            </div>
          </GlassPanel>

          {diff && (
            <GlassPanel variant="secondary" eyebrow="SNAPSHOT DIFF" title={`系统变化 · V${diff.fromVersion ?? '?'} → V${diff.toVersion}`}>
              <SnapshotDiffPanel diff={diff} />
            </GlassPanel>
          )}

          <WarningBanner tone="gold">我的系统已经因为这次反馈发生变化。</WarningBanner>
          <div className="button-row">
            <PrimaryButton onClick={() => onNavigate('system')}>查看我的系统</PrimaryButton>
            <SecondaryButton
              onClick={() => dispatch({ type: 'START_ACTION' })}
              disabled={isOffline}
            >
              记录下一次反馈
            </SecondaryButton>
            <SecondaryButton onClick={() => onNavigate('plan')}>查看计划版本</SecondaryButton>
          </div>
        </>
      )}
    </section>
  )
}
