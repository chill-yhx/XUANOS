import { navigationItems } from '../data/mockData'
import type { PageId } from '../types'

interface SidebarProps {
  currentPage: PageId
  onNavigate: (page: PageId) => void
}

export function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  return (
    <aside className="command-dock-wrap">
      <nav className="command-dock" aria-label="核心页面">
        {navigationItems.map((item) => (
          <button
            key={item.id}
            className={`dock-item ${item.id === currentPage ? 'is-active' : ''}`}
            type="button"
            onClick={() => onNavigate(item.id)}
          >
            <span className="dock-code">{item.code}</span>
            <span className="dock-label">{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  )
}
