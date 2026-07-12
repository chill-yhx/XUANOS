import type { ReactNode } from 'react'
import type { TagTone } from '../types'

interface WarningBannerProps {
  tone?: Extract<TagTone, 'gold' | 'impact' | 'risk'>
  children: ReactNode
}

export function WarningBanner({ tone = 'gold', children }: WarningBannerProps) {
  return (
    <div className={`warning-banner warning-banner--${tone}`}>
      <span className="warning-symbol" aria-hidden="true">!</span>
      <p>{children}</p>
    </div>
  )
}
