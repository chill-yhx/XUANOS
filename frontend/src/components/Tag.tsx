import type { ReactNode } from 'react'
import type { TagTone } from '../types'

interface TagProps {
  children: ReactNode
  tone?: TagTone
}

export function Tag({ children, tone = 'gold' }: TagProps) {
  return <span className={`tag tag--${tone}`}>{children}</span>
}
