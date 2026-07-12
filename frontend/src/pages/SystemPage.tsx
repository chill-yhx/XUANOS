import { useEffect, useState } from 'react'
import { diaryEntries } from '../data/mockData'
import type { PageId, SystemSection, SystemViewMode } from '../types'
import { GlassPanel } from '../components/GlassPanel'
import { SecondaryButton } from '../components/SecondaryButton'
import { SystemSnapshotCard } from '../components/SystemSnapshotCard'
import { SystemViewToggle } from '../components/SystemViewToggle'
import { WarningBanner } from '../components/WarningBanner'
import { useInteraction } from '../state/useInteraction'

interface PageProps {
  onNavigate: (page: PageId) => void
}

export function SystemPage({ onNavigate }: PageProps) {
  const { state, dispatch, refreshSnapshot, resetDemo } = useInteraction()
  const [mode, setMode] = useState<SystemViewMode>('mixed')
  const [notice, setNotice] = useState('')
  const snapshot = state.serverSnapshot ?? state.systemSnapshot
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
      entries: snapshot.effectivePatterns.slice(-3).map((item) => item.content),
      footnote: snapshot.revisionCount > 0 ? '包含本次行动产生的候选规律，仍需后续验证。' : '当前为初始候选，等待行动证据。',
    },
    {
      id: 'review', title: '系统仍在验证', english: 'UNDER REVIEW', tone: 'impact',
      entries: snapshot.hypotheses.length ? snapshot.hypotheses.slice(0, 3).map((item) => item.content) : ['本轮原假设已被行动结果削弱，等待新的重复证据。'],
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

  const showProfile = mode === 'profile' || mode === 'mixed'
  const showDiary = mode === 'diary' || mode === 'mixed'
  const visibleSections = mode === 'mixed'
    ? systemSections.filter((section) => ['vector', 'working', 'review', 'revision'].includes(section.id))
    : systemSections
  const dynamicDiary = state.systemRevision
    ? [{ label: '刚刚', title: '系统修正', content: state.systemRevision.revisedJudgment }, ...diaryEntries]
    : diaryEntries

  return (
    <section className="page system-stack">
      <header className="page-heading">
        <div>
          <div className="eyebrow">PERSONAL SYSTEM · REVISION {snapshot.revisionCount}</div>
          <h1>我的系统</h1>
        </div>
        <p className="page-heading-copy">这是可纠正、会更新的当前快照，不是对你的固定定义。</p>
      </header>

      {snapshot.revisionCount > 0 && (
        <WarningBanner tone="gold">我的系统已经因为这次反馈发生变化。当前阶段与唯一行动已更新。</WarningBanner>
      )}

      {state.isOfflineCache && (
        <WarningBanner tone="impact">离线缓存 · 当前显示最近一次成功同步的用户快照。</WarningBanner>
      )}
      {state.apiError && !state.serverSnapshot && (
        <WarningBanner tone="risk">服务端快照不可用。本地 Mock 仅用于界面演示，不作为个人系统事实。</WarningBanner>
      )}

      <GlassPanel
        variant="ghost"
        className="system-mode-panel"
        eyebrow="VIEW MODE"
        title="展示方式"
        action={<SecondaryButton onClick={handleReset}>重置演示数据</SecondaryButton>}
      >
        <SystemViewToggle value={mode} onChange={setMode} />
      </GlassPanel>

      {notice && <WarningBanner tone="gold">{notice}</WarningBanner>}

      {showProfile && (
        <section className="system-snapshot-grid" aria-label="个人系统档案">
          {visibleSections.map((section) => <SystemSnapshotCard key={section.id} section={section} onAction={handleAction} />)}
        </section>
      )}

      {showDiary && (
        <GlassPanel variant="secondary" eyebrow="RECENT NOTES" title="近期记录">
          <div className="diary-panel">
            {dynamicDiary.slice(0, mode === 'mixed' ? 3 : 6).map((entry, index) => (
              <article className="diary-entry" key={`${entry.title}-${index}`}>
                <span className="metric-label">{entry.label}</span>
                <div>
                  <div className="micro-label">{entry.title}</div>
                  <p>{entry.content}</p>
                </div>
              </article>
            ))}
          </div>
        </GlassPanel>
      )}
    </section>
  )
}
