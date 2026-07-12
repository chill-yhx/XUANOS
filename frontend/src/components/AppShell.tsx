import type { ReactNode } from 'react'
import systemBackground from '../assets/system-background.png'
import type { PageId } from '../types'
import { ParticleBackground } from './ParticleBackground'
import { Sidebar } from './Sidebar'
import { TopStatusBar } from './TopStatusBar'
import { useInteraction } from '../state/useInteraction'

interface AppShellProps {
  currentPage: PageId
  onNavigate: (page: PageId) => void
  children: ReactNode
}

export function AppShell({ currentPage, onNavigate, children }: AppShellProps) {
  const { state } = useInteraction()

  return (
    <div className="app-shell">
      <div className="space-depth" />
      <div className="ambient-art" style={{ backgroundImage: `url(${systemBackground})` }} />
      <div className="ambient-veil" />
      <ParticleBackground />
      <div className={`shell-layer ${currentPage === 'home' ? 'is-home' : ''}`}>
        <TopStatusBar currentPage={currentPage} onNavigate={onNavigate} />
        <main className={`main-workspace ${currentPage === 'home' ? 'is-hero' : ''}`}>{children}</main>
        <Sidebar currentPage={currentPage} onNavigate={onNavigate} />
        <aside className="snapshot-capsule">
          <details>
            <summary>
              <span className="status-pulse" />
              <span>{state.activeThread.status}</span>
              <span className="capsule-expand">+</span>
            </summary>
            <div className="capsule-detail">
              <span>系统状态</span><strong>{state.activeThread.status}</strong>
              <span>当前阶段</span><strong>{state.activeThread.phase}</strong>
            </div>
          </details>
        </aside>
      </div>
    </div>
  )
}
