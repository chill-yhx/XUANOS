import { Tag } from './Tag'
import type { UnderstandingSummary } from '../types'

export function UnderstandingCard({ summary }: { summary: UnderstandingSummary }) {
  const entries = [
    ['真实目标', summary.realGoal],
    ['当前基础', summary.foundation],
    ['现实限制', summary.constraints],
    ['主要矛盾', summary.tension],
    ['仍不确定', summary.uncertain],
  ]

  return (
    <div className="understanding-grid">
      {entries.map(([label, value], index) => (
        <div className="understanding-cell" key={label}>
          <div className="metric-label">{label}</div>
          <p>{value}</p>
          {index === entries.length - 1 && <Tag tone="impact">待确认</Tag>}
        </div>
      ))}
    </div>
  )
}
