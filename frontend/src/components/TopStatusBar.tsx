import type { PageId } from '../types'
import { useInteraction } from '../state/useInteraction'
import { useAuth } from '../state/useAuth'

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
  const { state, switchThread, createNewThread } = useInteraction()
  const auth = useAuth()
  const isSyncing = state.isLoading
    || state.understandingRequestStatus === 'loading'
    || state.planRequestStatus === 'loading'
    || state.actionResultRequestStatus === 'loading'
    || state.correctionRequestStatus === 'loading'
  const statusLabel = isSyncing
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
      <div className="top-thread-tools">
        {state.availableThreads.length > 0 && (
          <select
            className="top-thread-select"
            aria-label="切换任务线程"
            value={state.activeThreadId ?? ''}
            disabled={state.isLoading}
            onChange={(event) => {
              const threadId = event.target.value
              if (!threadId || threadId === state.activeThreadId) return
              void switchThread(threadId).then((switched) => {
                if (switched) onNavigate('home')
              })
            }}
          >
            {state.availableThreads.map((thread) => (
              <option value={thread.id} key={thread.id}>{thread.title}</option>
            ))}
          </select>
        )}
        <button
          className="top-thread-add"
          type="button"
          aria-label="创建新任务线程"
          title="创建新任务线程"
          disabled={state.isLoading}
          onClick={() => {
            void createNewThread().then((created) => {
              if (created) onNavigate('understanding')
            })
          }}
        >
          +
        </button>
        {auth.session?.needsPasswordSetup && (
          <button className="top-account-prompt" type="button" onClick={() => onNavigate('system')}>设置登录密码</button>
        )}
        <button className="top-system-link" type="button" onClick={() => onNavigate('system')}>我的系统</button>
      </div>
    </header>
  )
}
