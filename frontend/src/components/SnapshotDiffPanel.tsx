import type { SnapshotChangeKind, SnapshotDiff } from '../types'
import { Tag } from './Tag'

const changeLabels: Record<SnapshotChangeKind, string> = {
  added: '新增',
  modified: '修改',
  retained: '保留',
  weakened: '弱化',
  rejected: '拒绝继续使用',
}

const changeTones: Record<SnapshotChangeKind, 'gold' | 'muted' | 'success' | 'impact' | 'risk'> = {
  added: 'success',
  modified: 'gold',
  retained: 'muted',
  weakened: 'impact',
  rejected: 'risk',
}

export function SnapshotDiffPanel({ diff }: { diff: SnapshotDiff }) {
  if (!diff.isComparable) {
    return <p className="snapshot-no-change">已恢复最新快照，但本地没有上一版本，无法生成逐项对比。</p>
  }

  if (!diff.hasChanges) {
    return <p className="snapshot-no-change">本次反馈已记录，系统判断暂未改变。</p>
  }

  const changed = diff.changes.filter((item) => item.kind !== 'retained')
  const retained = diff.changes.filter((item) => item.kind === 'retained')

  return (
    <div className="snapshot-diff">
      <div className="snapshot-diff-list">
        {changed.map((change) => (
          <article className="snapshot-change" key={change.id}>
            <div className="snapshot-change-head">
              <span className="metric-label">{change.label}</span>
              <Tag tone={changeTones[change.kind]}>{changeLabels[change.kind]}</Tag>
            </div>
            {change.before && <p className="snapshot-change-before">之前 · {change.before}</p>}
            {change.after && <p className="snapshot-change-after">现在 · {change.after}</p>}
          </article>
        ))}
      </div>
      {retained.length > 0 && (
        <details className="snapshot-retained">
          <summary>保留项 · {retained.length}</summary>
          <div>
            {retained.map((change) => (
              <span key={change.id}>{change.label} · {change.after}</span>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
