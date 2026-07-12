import type { ReactNode } from 'react'

interface GlassPanelProps {
  children: ReactNode
  className?: string
  eyebrow?: string
  title?: string
  action?: ReactNode
  variant?: 'primary' | 'secondary' | 'ghost'
}

export function GlassPanel({ children, className = '', eyebrow, title, action, variant = 'secondary' }: GlassPanelProps) {
  return (
    <section className={`glass-panel glass-panel--${variant} ${className}`.trim()}>
      {(eyebrow || title || action) && (
        <header className="glass-panel-header">
          <div>
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            {title && <h2 className="glass-panel-title">{title}</h2>}
          </div>
          {action}
        </header>
      )}
      <div className="glass-panel-body">{children}</div>
    </section>
  )
}
