import type { PlanItem } from '../types'

export function TimeBlockPlan({ items }: { items: PlanItem[] }) {
  const scheduledItems = items.filter((item) => item.timeBlock || item.estimatedMinutes)

  if (!scheduledItems.length) {
    return <p className="muted-copy">服务端尚未设置独立时段。以当前唯一行动为准。</p>
  }

  return (
    <div className="time-block-list">
      {scheduledItems.map((item) => (
        <div className="time-block" key={item.id}>
          <span className="metric-label">{item.timeBlock || `${item.estimatedMinutes} MIN`}</span>
          <p>{item.title}</p>
        </div>
      ))}
    </div>
  )
}
