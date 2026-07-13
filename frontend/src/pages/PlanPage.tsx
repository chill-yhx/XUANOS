import { useState } from 'react'
import type { PageId, PriorityGroup } from '../types'
import { ActionCard } from '../components/ActionCard'
import { CorrectionPanel } from '../components/CorrectionPanel'
import { GlassPanel } from '../components/GlassPanel'
import { GoalPriorityCard } from '../components/GoalPriorityCard'
import { PlanDecisionCard } from '../components/PlanDecisionCard'
import { PrimaryButton } from '../components/PrimaryButton'
import { SecondaryButton } from '../components/SecondaryButton'
import { Tag } from '../components/Tag'
import { TimeBlockPlan } from '../components/TimeBlockPlan'
import { WarningBanner } from '../components/WarningBanner'
import { developmentMockEnabled } from '../config/developmentMock'
import { useInteraction } from '../state/useInteraction'

interface PageProps {
  onNavigate: (page: PageId) => void
}

function versionStatus(status: string) {
  if (status === 'accepted') return '当前接受'
  if (status === 'superseded') return '历史版本'
  if (status === 'cancelled') return '已取消'
  return '等待确认'
}

export function PlanPage({ onNavigate }: PageProps) {
  const {
    state,
    dispatch,
    reviseCurrentPlan,
    acceptCurrentPlan,
    refreshActiveThread,
  } = useInteraction()
  const [showCorrection, setShowCorrection] = useState(false)
  const currentPlan = state.currentPlan
  const displayedPlan = state.planVersions.find((item) => item.id === state.lastViewedPlanId)
    ?? currentPlan

  if (!currentPlan || !displayedPlan) {
    return (
      <section className="page page-stack">
        <WarningBanner tone="impact">理解尚未确认，当前不能生成计划。</WarningBanner>
        <div><PrimaryButton onClick={() => onNavigate('understanding')}>返回引导式理解</PrimaryButton></div>
      </section>
    )
  }

  const priorityGroups: PriorityGroup[] = [
    { title: '维持目标', label: 'KEEP', tone: 'success', items: displayedPlan.maintenanceGoals },
    { title: '暂停目标', label: 'PAUSE', tone: 'impact', items: displayedPlan.pausedGoals },
    { title: '删除事项', label: 'REMOVE', tone: 'risk', items: displayedPlan.removedItems },
  ]
  const isLoading = state.planRequestStatus === 'loading'
  const isOffline = state.planSource === 'cache' || state.isOfflineCache
  const writesBlocked = state.planSource !== 'api' || state.isOfflineCache
  const isViewingCurrent = displayedPlan.id === currentPlan.id
  const accepted = currentPlan.status === 'accepted'
  const draft = state.planModificationDraft

  const enterAction = () => {
    dispatch({ type: 'START_ACTION' })
    onNavigate('feedback')
  }

  const openCorrection = () => {
    if (!draft.userChoice) {
      dispatch({
        type: 'UPDATE_PLAN_MODIFICATION_DRAFT',
        value: { userChoice: currentPlan.singleAction },
      })
    }
    setShowCorrection(true)
  }

  return (
    <section className="page page-stack">
      <header className="page-heading">
        <div>
          <div className="eyebrow">PLAN DECISION · V{displayedPlan.version}</div>
          <h1>计划裁决</h1>
        </div>
        <div className="plan-source-meta">
          {state.planSource === 'api'
            ? <Tag tone="success">SERVER PLAN</Tag>
            : state.planSource === 'cache'
              ? <Tag tone="impact">OFFLINE CACHE</Tag>
              : developmentMockEnabled && state.planSource === 'mock'
                ? <Tag tone="muted">DEVELOPMENT MOCK</Tag>
                : <Tag tone="muted">WAITING FOR SERVER</Tag>}
          <span>{displayedPlan.createdAt ? new Date(displayedPlan.createdAt).toLocaleString() : ''}</span>
        </div>
      </header>

      {isOffline && (
        <WarningBanner tone="impact">
          当前仅展示最近缓存。恢复服务前不能创建、修改或接受计划。
          <SecondaryButton onClick={() => void refreshActiveThread()} disabled={isLoading}>
            {isLoading ? '正在重连' : '重新连接'}
          </SecondaryButton>
        </WarningBanner>
      )}
      {state.planApiError && (
        <>
          <WarningBanner tone="impact">{state.planApiError.message}</WarningBanner>
          {!isOffline && (
            <div>
              <SecondaryButton onClick={() => void refreshActiveThread()} disabled={isLoading}>
                {isLoading ? '正在同步' : '同步最新计划'}
              </SecondaryButton>
            </div>
          )}
        </>
      )}
      {!isViewingCurrent && (
        <WarningBanner tone="gold">正在查看历史 Plan v{displayedPlan.version}。历史版本只读，不会覆盖当前计划。</WarningBanner>
      )}

      <PlanDecisionCard plan={displayedPlan} />

      <section className="priority-grid" aria-label="目标取舍">
        {priorityGroups.map((group) => <GoalPriorityCard key={group.title} group={group} />)}
      </section>

      <details className="plan-disclosure" open={displayedPlan.status === 'accepted'}>
        <summary>展开时段、行动与复查</summary>
        <div className="plan-disclosure-content">
          <GlassPanel variant="secondary" eyebrow="TIME BLOCKS" title="行动时段">
            <TimeBlockPlan items={displayedPlan.items ?? []} />
          </GlassPanel>

          <ActionCard
            action={displayedPlan.singleAction}
            completion={displayedPlan.completionStandard}
            workload={displayedPlan.workload}
            onPrimary={isViewingCurrent && accepted && !writesBlocked ? enterAction : undefined}
            primaryLabel="进入行动反馈"
          />

          <GlassPanel variant="ghost" eyebrow="DECISION BOUNDS" title="影响与复查">
            <div className="metric-grid">
              <div><span className="metric-label">系统原建议</span><span>{displayedPlan.systemRecommendation}</span></div>
              <div><span className="metric-label">预计影响</span><span>{displayedPlan.expectedImpact || '保持当前范围，先验证完整闭环。'}</span></div>
              <div><span className="metric-label">复查条件</span><span>{displayedPlan.reviewCondition}</span></div>
              {displayedPlan.acceptedAt && (
                <div><span className="metric-label">接受时间</span><span>{new Date(displayedPlan.acceptedAt).toLocaleString()}</span></div>
              )}
            </div>
          </GlassPanel>
        </div>
      </details>

      {displayedPlan.isUserFinalChoice && (
        <WarningBanner tone="impact">此部分为用户最终选择，并非 XUANOS 当前首选建议。</WarningBanner>
      )}

      {showCorrection && isViewingCurrent && (
        <CorrectionPanel
          systemRecommendation={currentPlan.systemRecommendation}
          reason={draft.reason}
          userChoice={draft.userChoice}
          expectedImpactAcknowledged={draft.expectedImpactAcknowledged}
          isLoading={isLoading}
          onChange={(value) => dispatch({ type: 'UPDATE_PLAN_MODIFICATION_DRAFT', value })}
          onClose={() => setShowCorrection(false)}
          onConfirm={() => void reviseCurrentPlan().then((revised) => revised && setShowCorrection(false))}
        />
      )}

      <details className="plan-version-history" open={state.planVersions.length > 1}>
        <summary>计划版本 · {state.planVersions.length}</summary>
        <div className="version-list">
          {state.planVersions.map((version) => (
            <button
              className={`version-item ${displayedPlan.id === version.id ? 'is-active' : ''}`}
              key={version.id}
              type="button"
              onClick={() => dispatch({ type: 'SELECT_PLAN_VERSION', planId: version.id })}
            >
              <span>V{version.version}</span>
              <strong>{version.singleAction}</strong>
              <small>{versionStatus(version.status)}</small>
            </button>
          ))}
        </div>
      </details>

      {accepted && isViewingCurrent && (
        <WarningBanner tone="gold">Plan v{currentPlan.version} 已由服务端接受。现在可以提交真实行动反馈。</WarningBanner>
      )}

      <div className="plan-actions">
        <div className="plan-actions-left">
          {isViewingCurrent && !accepted && (
            <>
              <SecondaryButton onClick={openCorrection} disabled={writesBlocked || isLoading}>修改计划</SecondaryButton>
              <SecondaryButton onClick={openCorrection} disabled={writesBlocked || isLoading}>我不同意这个判断</SecondaryButton>
            </>
          )}
          {!isViewingCurrent && (
            <SecondaryButton onClick={() => dispatch({ type: 'SELECT_PLAN_VERSION', planId: currentPlan.id })}>
              查看当前 V{currentPlan.version}
            </SecondaryButton>
          )}
        </div>
        <div className="plan-actions-right">
          <SecondaryButton
            onClick={() => { dispatch({ type: 'REOPEN_QUESTIONS' }); onNavigate('understanding') }}
            disabled={isLoading}
          >
            重新回答问题
          </SecondaryButton>
          {isViewingCurrent && (accepted
            ? <PrimaryButton onClick={enterAction} disabled={writesBlocked}>进入行动</PrimaryButton>
            : (
              <PrimaryButton onClick={() => void acceptCurrentPlan()} disabled={writesBlocked || isLoading}>
                {isLoading ? '正在接受计划' : state.planApiError ? '重试接受计划' : '接受当前计划'}
              </PrimaryButton>
            ))}
        </div>
      </div>
    </section>
  )
}
