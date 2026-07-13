import { useEffect, useMemo, useState } from 'react'
import { CorrectionResultNotice } from '../components/CorrectionResultNotice'
import { CorrectionTargetCard } from '../components/CorrectionTargetCard'
import { GlassPanel } from '../components/GlassPanel'
import { PrimaryButton } from '../components/PrimaryButton'
import { SecondaryButton } from '../components/SecondaryButton'
import { SnapshotDiffPanel } from '../components/SnapshotDiffPanel'
import { SystemCorrectionPanel } from '../components/SystemCorrectionPanel'
import { SystemSnapshotCard } from '../components/SystemSnapshotCard'
import { SystemViewToggle } from '../components/SystemViewToggle'
import { Tag } from '../components/Tag'
import { WarningBanner } from '../components/WarningBanner'
import { developmentMockEnabled } from '../config/developmentMock'
import { buildCorrectionTargets } from '../mappers/correctionMapper'
import { useInteraction } from '../state/useInteraction'
import type { CorrectionTarget, PageId, SystemSection, SystemViewMode } from '../types'

interface PageProps {
  onNavigate: (page: PageId) => void
}

export function SystemPage({ onNavigate }: PageProps) {
  const {
    state,
    dispatch,
    refreshSnapshot,
    resetDemo,
    submitCurrentCorrection,
  } = useInteraction()
  const [mode, setMode] = useState<SystemViewMode>('mixed')
  const snapshot = state.latestSnapshot ?? state.serverSnapshot ?? state.systemSnapshot
  const correctionTargets = useMemo(
    () => buildCorrectionTargets(snapshot, state.currentPlan),
    [snapshot, state.currentPlan],
  )

  useEffect(() => {
    void refreshSnapshot()
  }, [refreshSnapshot])

  const systemSections: SystemSection[] = [
    {
      id: 'vector', title: '当前主线', english: 'CURRENT VECTOR', tone: 'gold',
      entries: [`主目标：${snapshot.currentVector}`, `当前阶段：${snapshot.currentStage}`, `唯一行动：${snapshot.currentAction}`],
    },
    {
      id: 'bounds', title: '现实边界', english: 'REALITY BOUNDS', tone: 'muted',
      entries: snapshot.realityBoundaries.slice(0, 3),
    },
    {
      id: 'working', title: '对我有效', english: 'WORKING PATTERNS', tone: 'success',
      entries: snapshot.effectivePatterns.slice(-3).map((item) => `${item.content} · ${item.maturity}`),
      footnote: snapshot.revisionCount > 0 ? '行动证据产生的候选规律，仍需后续重复验证。' : '等待真实行动证据。',
    },
    {
      id: 'review', title: '系统仍在验证', english: 'UNDER REVIEW', tone: 'impact',
      entries: snapshot.hypotheses.length
        ? snapshot.hypotheses.slice(0, 3).map((item) => `${item.content} · ${item.status}`)
        : ['当前没有继续生效的待验证判断。'],
    },
    {
      id: 'revision', title: '最近修正', english: 'RECENT REVISION', tone: 'gold',
      entries: snapshot.recentRevisions.slice(0, 3),
    },
    {
      id: 'corrections', title: '用户纠正', english: 'USER CORRECTIONS', tone: 'muted',
      entries: snapshot.userCorrections.slice(0, 4),
    },
  ]

  const handleReset = () => {
    if (!window.confirm('重置本地演示缓存？本轮不会删除服务端线程与快照。')) return
    resetDemo()
    onNavigate('home')
  }

  const startNextFeedback = () => {
    dispatch({ type: 'START_ACTION' })
    onNavigate('feedback')
  }

  const selectCorrectionTarget = (target: CorrectionTarget) => {
    dispatch({ type: 'OPEN_CORRECTION_TARGET', target })
  }

  const showProfile = mode === 'profile' || mode === 'mixed'
  const showDiary = mode === 'diary' || mode === 'mixed'
  const visibleSections = mode === 'mixed'
    ? systemSections.filter((section) => ['vector', 'working', 'review', 'revision'].includes(section.id))
    : systemSections
  const serverNotes = snapshot.recentRevisions.map((content, index) => ({
    label: index === 0 ? 'LATEST' : `REV ${snapshot.revisionCount - index}`,
    title: index === 0 ? '最新系统修正' : '历史修正',
    content,
  }))
  const sourceTag = state.isOfflineCache || state.dataSource === 'cache'
    ? <Tag tone="impact">OFFLINE CACHE</Tag>
    : snapshot.id && state.dataSource === 'api'
      ? <Tag tone="success">SERVER RESULT</Tag>
      : developmentMockEnabled && state.dataSource === 'mock'
        ? <Tag tone="muted">DEVELOPMENT MOCK</Tag>
        : <Tag tone="muted">WAITING FOR SERVER</Tag>
  const correctionResult = state.latestCorrectionResult
  const correctionResultIsCurrent = Boolean(
    correctionResult
    && correctionResult.snapshot.id === snapshot.id
    && correctionResult.snapshot.version === snapshot.version,
  )
  const changeSource = correctionResultIsCurrent
    ? state.correctionSource
    : state.systemRevisionSource
  const correctionIsOffline = state.isOfflineCache || state.dataSource !== 'api'

  return (
    <section className="page system-stack">
      <header className="page-heading">
        <div>
          <div className="eyebrow">PERSONAL SYSTEM · SNAPSHOT V{snapshot.version}</div>
          <h1>我的系统</h1>
        </div>
        <div className="plan-source-meta">
          {sourceTag}
          {snapshot.createdAt && <span>{new Date(snapshot.createdAt).toLocaleString()}</span>}
        </div>
      </header>

      {state.systemRevision && ['api', 'cache'].includes(state.systemRevisionSource) && (
        <WarningBanner tone="gold">我的系统已经因为行动反馈发生变化。当前阶段与唯一行动已更新。</WarningBanner>
      )}
      {state.isOfflineCache && (
        <WarningBanner tone="impact">离线缓存 · 可以查看快照和编辑纠正草稿，恢复服务后才能提交。</WarningBanner>
      )}
      {state.apiError && !snapshot.id && (
        <WarningBanner tone="risk">服务端快照不可用。当前没有可作为系统事实的本地结果。</WarningBanner>
      )}

      <GlassPanel
        variant="ghost"
        className="system-mode-panel"
        eyebrow="VIEW MODE"
        title="展示方式"
        action={<SecondaryButton onClick={handleReset}>重置演示数据</SecondaryButton>}
      >
        <SystemViewToggle value={mode} onChange={setMode} />
        <div className="snapshot-meta-grid">
          <div><span className="metric-label">SNAPSHOT</span><strong>V{snapshot.version}</strong></div>
          <div><span className="metric-label">SOURCE ACTION</span><strong>{snapshot.sourceActionResultId ?? '尚无行动结果'}</strong></div>
          <div><span className="metric-label">CREATED AT</span><strong>{snapshot.createdAt ? new Date(snapshot.createdAt).toLocaleString() : '未同步'}</strong></div>
        </div>
      </GlassPanel>

      {correctionResult && (
        <CorrectionResultNotice
          result={correctionResult}
          source={state.correctionSource}
          isCurrentSnapshot={correctionResultIsCurrent}
        />
      )}

      {state.snapshotDiff && ['api', 'cache'].includes(changeSource) && (
        <GlassPanel
          variant="primary"
          eyebrow={changeSource === 'api' ? 'SYSTEM CHANGE · SERVER RESULT' : 'SYSTEM CHANGE · OFFLINE CACHE'}
          title={`本次系统变化 · V${state.snapshotDiff.fromVersion ?? '?'} → V${state.snapshotDiff.toVersion}`}
        >
          <SnapshotDiffPanel diff={state.snapshotDiff} />
        </GlassPanel>
      )}

      {showProfile && (
        <section className="system-snapshot-grid" aria-label="个人系统档案">
          {visibleSections.map((section) => <SystemSnapshotCard key={section.id} section={section} />)}
        </section>
      )}

      {showProfile && correctionTargets.length > 0 && (
        <section className="correction-workspace" aria-label="纠正系统判断">
          <header className="correction-workspace-heading">
            <div>
              <div className="eyebrow">USER CORRECTION</div>
              <h2>纠正系统判断</h2>
            </div>
            <Tag tone="muted">{correctionTargets.length} ITEMS</Tag>
          </header>
          <div className="correction-target-grid">
            {correctionTargets.map((target) => (
              <CorrectionTargetCard
                key={target.key}
                target={target}
                isActive={state.activeCorrectionTarget?.key === target.key}
                onSelect={selectCorrectionTarget}
              />
            ))}
          </div>

          {state.activeCorrectionTarget && (
            <SystemCorrectionPanel
              target={state.activeCorrectionTarget}
              correctionType={state.correctionType}
              draft={state.correctionDraft}
              reason={state.correctionReason}
              discontinueConfirmed={state.correctionDiscontinueConfirmed}
              isSubmitting={state.correctionRequestStatus === 'loading'}
              isOffline={correctionIsOffline}
              error={state.correctionApiError}
              onTypeChange={(correctionType) => dispatch({ type: 'UPDATE_CORRECTION_TYPE', correctionType })}
              onDraftChange={(value) => dispatch({ type: 'UPDATE_CORRECTION_DRAFT', value })}
              onReasonChange={(value) => dispatch({ type: 'UPDATE_CORRECTION_REASON', value })}
              onDiscontinueConfirmation={(confirmed) => dispatch({ type: 'UPDATE_CORRECTION_CONFIRMATION', confirmed })}
              onSubmit={() => void submitCurrentCorrection()}
              onCancel={() => dispatch({ type: 'CLOSE_CORRECTION_TARGET' })}
            />
          )}
        </section>
      )}

      {showDiary && (
        <GlassPanel variant="secondary" eyebrow="SERVER REVISION LOG" title="近期记录">
          {serverNotes.length ? (
            <div className="diary-panel">
              {serverNotes.slice(0, mode === 'mixed' ? 3 : 6).map((entry, index) => (
                <article className="diary-entry" key={`${entry.title}-${index}`}>
                  <span className="metric-label">{entry.label}</span>
                  <div>
                    <div className="micro-label">{entry.title}</div>
                    <p>{entry.content}</p>
                  </div>
                </article>
              ))}
            </div>
          ) : <p className="snapshot-no-change">当前还没有服务端修正记录。</p>}
        </GlassPanel>
      )}

      {state.currentPlan?.status === 'accepted' && (
        <div className="button-row">
          <PrimaryButton onClick={startNextFeedback} disabled={state.isOfflineCache || state.planSource !== 'api'}>
            记录下一次行动
          </PrimaryButton>
          <SecondaryButton onClick={() => onNavigate('feedback')}>查看最近反馈</SecondaryButton>
        </div>
      )}
    </section>
  )
}
