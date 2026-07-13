import type { PageId } from '../types'

export const navigationItems: Array<{ id: PageId; label: string; code: string }> = [
  { id: 'home', label: '控制台', code: '01' },
  { id: 'understanding', label: '引导式理解', code: '02' },
  { id: 'plan', label: '计划裁决', code: '03' },
  { id: 'feedback', label: '行动执行', code: '04' },
  { id: 'system', label: '我的系统', code: '05' },
]
