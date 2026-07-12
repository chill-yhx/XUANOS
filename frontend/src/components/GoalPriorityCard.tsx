import type { PriorityGroup } from '../types'
import { Tag } from './Tag'

interface GoalPriorityCardProps {
  group: PriorityGroup
}

export function GoalPriorityCard({ group }: GoalPriorityCardProps) {
  const toneClass = group.tone === 'impact' ? 'pause' : group.tone === 'risk' ? 'remove' : 'keep'

  return (
    <section className={`priority-card priority-card--${toneClass}`}>
      <div className="priority-heading">
        <span>{group.title}</span>
        <Tag tone={group.tone}>{group.label}</Tag>
      </div>
      <ul>
        {group.items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </section>
  )
}
