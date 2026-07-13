import type { PageId } from '../types'
import { useInteraction } from '../state/useInteraction'

const labels: Record<PageId, string> = {
  home: '入口',
  understanding: '理解',
  plan: '裁决',
  feedback: '反馈',
  system: '档案',
}

interface TopStatusBarProps {
  currentPage: PageId
  onNavigate: (page: PageId) => void
}

export function TopStatusBar({ currentPage, onNavigate }: TopStatusBarProps) {
  const { state } = useInteraction()
  const statusLabel = state.isLoading || state.understandingRequestStatus === 'loading'
    ? 'SYSTEM SYNCING'
    : state.isOfflineCache
      ? 'OFFLINE CACHE'
      : 'SYSTEM ACTIVE'

  return (
    <header className="top-status-bar">
      <button className="status-brand" type="button" onClick={() => onNavigate('home')} aria-label="返回 XUANOS 首页">
        <span className="brand-mark">X</span>
        <span className="brand-name">XUANOS</span>
      </button>
      <div className="status-meta">
        <div className="status-line">
          <span className={`status-pulse ${state.isOfflineCache ? 'is-offline' : ''}`} />{statusLabel}
        </div>
        <div className="status-divider" />
        <div className="status-context">{labels[currentPage]}</div>
      </div>
      <button className="top-system-link" type="button" onClick={() => onNavigate('system')}>我的系统</button>
    </header>
  )
}
