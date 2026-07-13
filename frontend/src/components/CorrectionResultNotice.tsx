import type { DataSource, UserCorrectionResult } from '../types'
import { Tag } from './Tag'

interface CorrectionResultNoticeProps {
  result: UserCorrectionResult
  source: DataSource
  isCurrentSnapshot: boolean
}

const correctionLabels: Record<string, string> = {
  accurate: '已确认准确',
  partial: '已部分修正',
  inaccurate: '已纠正',
  changed: '已记录变化',
  discontinue: '已停止使用',
}

const targetLabels: Record<string, string> = {
  understanding: '理解摘要',
  goal: '当前主线',
  constraint: '现实边界',
  plan: '下一步行动',
  snapshot: '系统状态',
  hypothesis: '系统判断',
  system_section: '系统快照条目',
}

export function CorrectionResultNotice({
  result,
  source,
  isCurrentSnapshot,
}: CorrectionResultNoticeProps) {
  const correction = result.correction
  const assessment = correction.assessment
  const resultText = assessment === 'accurate'
    ? '系统保留当前判断，本次没有创建新版快照。'
    : assessment === 'discontinue'
      ? '系统已停止使用这条判断，后续不会静默恢复。'
      : result.snapshotUpdated
        ? '系统已将用户修正写入新版快照。'
        : '本次纠正已记录，系统快照暂未改变。'

  return (
    <section className="correction-result-notice" aria-live="polite">
      <div className="correction-result-head">
        <div>
          <div className="micro-label">CORRECTION RESULT</div>
          <h2>{correctionLabels[assessment] ?? '纠正已记录'}</h2>
        </div>
        <Tag tone={source === 'api' && isCurrentSnapshot ? 'success' : 'impact'}>
          {source === 'api' && isCurrentSnapshot ? 'SERVER RESULT' : 'HISTORY / CACHE'}
        </Tag>
      </div>
      <dl className="correction-result-grid">
        <div><dt>纠正对象</dt><dd>{targetLabels[correction.targetType ?? ''] ?? '系统条目'}</dd></div>
        <div><dt>原判断</dt><dd>{correction.previousValue}</dd></div>
        <div><dt>用户修正</dt><dd>{assessment === 'accurate' ? '维持原判断' : correction.userValue}</dd></div>
        <div><dt>系统处理</dt><dd>{correction.systemHandling ?? resultText}</dd></div>
        <div><dt>快照版本</dt><dd>V{result.snapshot.version}</dd></div>
        <div><dt>更新时间</dt><dd>{new Date(correction.createdAt).toLocaleString()}</dd></div>
      </dl>
      <p className="correction-result-summary">{resultText}</p>
    </section>
  )
}
