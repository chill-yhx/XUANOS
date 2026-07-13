import type { SystemSection } from '../types'
import { Tag } from './Tag'

interface SystemSnapshotCardProps {
  section: SystemSection
}

export function SystemSnapshotCard({ section }: SystemSnapshotCardProps) {
  return (
    <section className="system-snapshot-card">
      <div className="system-card-head">
        <div>
          <div className="micro-label">{section.english}</div>
          <h2 className="system-card-title">{section.title}</h2>
        </div>
        <Tag tone={section.tone}>{section.tone === 'impact' ? '待验证' : '当前'}</Tag>
      </div>
      {section.entries.length ? (
        <ul>
          {section.entries.map((entry, index) => <li key={`${section.id}-${index}`}>{entry}</li>)}
        </ul>
      ) : <p className="snapshot-no-change">暂无服务端记录。</p>}
      {section.footnote && <div className="system-footnote">{section.footnote}</div>}
    </section>
  )
}
