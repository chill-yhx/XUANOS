import { mockThread } from '../data/mockData'
import { Tag } from './Tag'

interface ThreadCardProps {
  compact?: boolean
  onContinue?: () => void
}

export function ThreadCard({ compact = false, onContinue }: ThreadCardProps) {
  return (
    <button className="thread-card" type="button" onClick={onContinue}>
      <div className="micro-label">当前任务线程</div>
      <p className="thread-card-title">{mockThread.title}</p>
      <div className="thread-meta">
        <Tag tone="success">{mockThread.status}</Tag>
        {!compact && <Tag tone="muted">{mockThread.phase}</Tag>}
      </div>
      {!compact && <div className="timeline-note">下次复查：{mockThread.nextReview}</div>}
    </button>
  )
}
