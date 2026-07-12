import type { SystemSection } from '../types'
import { Tag } from './Tag'

interface SystemSnapshotCardProps {
  section: SystemSection
  onAction: (action: string, section: SystemSection) => void
}

export function SystemSnapshotCard({ section, onAction }: SystemSnapshotCardProps) {
  return (
    <section className="system-snapshot-card">
      <div className="system-card-head">
        <div>
          <div className="micro-label">{section.english}</div>
          <h2 className="system-card-title">{section.title}</h2>
        </div>
        <Tag tone={section.tone}>{section.tone === 'impact' ? '待验证' : '当前'}</Tag>
      </div>
      <ul>
        {section.entries.map((entry) => <li key={entry}>{entry}</li>)}
      </ul>
      {section.footnote && <div className="system-footnote">{section.footnote}</div>}
      <details className="snapshot-corrections">
        <summary>纠正此条</summary>
        <div className="system-action-row">
          {['准确', '部分准确', '不准确', '已经变化', '查看依据', '不希望继续使用'].map((action) => (
            <button key={action} className="snapshot-action" type="button" onClick={() => onAction(action, section)}>{action}</button>
          ))}
        </div>
      </details>
    </section>
  )
}
