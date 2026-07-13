import { useEffect, useState } from 'react'
import type { PageId, SystemSection, SystemViewMode } from '../types'
import { GlassPanel } from '../components/GlassPanel'
import { PrimaryButton } from '../components/PrimaryButton'
import { SecondaryButton } from '../components/SecondaryButton'
import { SnapshotDiffPanel } from '../components/SnapshotDiffPanel'
import { SystemSnapshotCard } from '../components/SystemSnapshotCard'
import { SystemViewToggle } from '../components/SystemViewToggle'
import { Tag } from '../components/Tag'
import { WarningBanner } from '../components/WarningBanner'
import { useInteraction } from '../state/useInteraction'

interface PageProps {
  onNavigate: (page: PageId) => void
}

export function SystemPage({ onNavigate }: PageProps) {
  const { state, dispatch, refreshSnapshot, resetDemo } = useInteraction()
  const [mode, setMode] = useState<SystemViewMode>('mixed')
  const [notice, setNotice] = useState('')
  const snapshot = state.latestSnapshot ?? state.serverSnapshot ?? state.systemSnapshot
  const localCorrections = state.corrections
    .filter((item) => item.assessment === 'system_snapshot')
    .map((item) => `${item.target}：${item.userValue}（本地演示）`)

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
      entries: [...localCorrections, ...snapshot.userCorrections].slice(0, 4),
    },
  ]

  const handleAction = (action: string, section: SystemSection) => {
    dispatch({ type: 'ADD_SYSTEM_CORRECTION', action, section })
    setNotice(`本地演示已记录：“${section.title}”被标记为“${action}”。纠正 API 将在后续批次接入。`)
  }

  const handleReset = () => {
    if (!window.confirm('重置本地演示进度？本轮不会删除服务端线程与快照。')) return
    resetDemo()
    onNavigate('home')
  }

  const startNextFeedback = () => {
    dispatch({ type: 'START_ACTION' })
    onNavigate('feedback')
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
  const sourceTag = state.isOfflineCache
    ? <Tag tone="impact">OFFLINE CACHE</Tag>
    : snapshot.id
      ? <Tag tone="success">SERVER RESULT</Tag>
      : <Tag tone="muted">DEVELOPMENT MOCK</Tag>

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

      {state.systemRevisionSource !== 'mock' && state.systemRevision && (
        <WarningBanner tone="gold">我的系统已经因为这次反馈发生变化。当前阶段与唯一行动已更新。</WarningBanner>
      )}
      {state.isOfflineCache && (
        <WarningBanner tone="impact">离线缓存 · 当前显示最近一次成功同步的行动结果与用户快照。</WarningBanner>
      )}
      {state.apiError && !snapshot.id && (
        <WarningBanner tone="risk">服务端快照不可用。本地演示数据不作为个人系统事实。</WarningBanner>
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

      {notice && <WarningBanner tone="gold">{notice}</WarningBanner>}

      {state.snapshotDiff && state.systemRevisionSource !== 'mock' && (
        <GlassPanel
          variant="primary"
          eyebrow={state.systemRevisionSource === 'api' ? 'SYSTEM CHANGE · SERVER RESULT' : 'SYSTEM CHANGE · OFFLINE CACHE'}
          title={`本次系统变化 · V${state.snapshotDiff.fromVersion ?? '?'} → V${state.snapshotDiff.toVersion}`}
        >
          <SnapshotDiffPanel diff={state.snapshotDiff} />
        </GlassPanel>
      )}

      {showProfile && (
        <section className="system-snapshot-grid" aria-label="个人系统档案">
          {visibleSections.map((section) => <SystemSnapshotCard key={section.id} section={section} onAction={handleAction} />)}
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
