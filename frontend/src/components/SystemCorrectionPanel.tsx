import type { ApiErrorState, CorrectionTarget, CorrectionType } from '../types'
import { PrimaryButton } from './PrimaryButton'
import { SecondaryButton } from './SecondaryButton'

interface SystemCorrectionPanelProps {
  target: CorrectionTarget
  correctionType: CorrectionType | null
  draft: string
  reason: string
  discontinueConfirmed: boolean
  isSubmitting: boolean
  isOffline: boolean
  error: ApiErrorState | null
  onTypeChange: (value: CorrectionType) => void
  onDraftChange: (value: string) => void
  onReasonChange: (value: string) => void
  onDiscontinueConfirmation: (value: boolean) => void
  onSubmit: () => void
  onCancel: () => void
}

const correctionOptions: Array<{ value: CorrectionType; label: string }> = [
  { value: 'accurate', label: '准确' },
  { value: 'partial', label: '部分准确' },
  { value: 'inaccurate', label: '不准确' },
  { value: 'changed', label: '已经变化' },
  { value: 'discontinue', label: '停止使用' },
]

function needsCorrectedValue(type: CorrectionType | null) {
  return type === 'partial' || type === 'inaccurate' || type === 'changed'
}

export function SystemCorrectionPanel({
  target,
  correctionType,
  draft,
  reason,
  discontinueConfirmed,
  isSubmitting,
  isOffline,
  error,
  onTypeChange,
  onDraftChange,
  onReasonChange,
  onDiscontinueConfirmation,
  onSubmit,
  onCancel,
}: SystemCorrectionPanelProps) {
  const needsDraft = needsCorrectedValue(correctionType)
  const canSubmit = Boolean(
    correctionType
    && (!needsDraft || draft.trim())
    && (correctionType !== 'discontinue' || discontinueConfirmed)
    && !isSubmitting
    && !isOffline,
  )

  return (
    <section className="system-correction-panel" aria-label={`纠正：${target.label}`}>
      <div className="system-correction-heading">
        <div>
          <div className="micro-label">CORRECTION TARGET</div>
          <h2>{target.label}</h2>
        </div>
        <span>SNAPSHOT V{target.snapshotVersion}</span>
      </div>

      <div className="correction-original-value">
        <span>系统原判断</span>
        <p>{target.originalValue}</p>
      </div>

      <div className="correction-type-control" aria-label="纠正类型">
        {correctionOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            className={correctionType === option.value ? 'is-active' : ''}
            aria-pressed={correctionType === option.value}
            disabled={isSubmitting}
            onClick={() => onTypeChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {needsDraft && (
        <label className="correction-field">
          <span>修正后的内容</span>
          <textarea
            value={draft}
            rows={3}
            placeholder="写下更准确、可继续使用的判断"
            disabled={isSubmitting}
            onChange={(event) => onDraftChange(event.target.value)}
          />
        </label>
      )}

      {correctionType === 'discontinue' && (
        <label className="correction-discontinue-confirmation">
          <input
            type="checkbox"
            checked={discontinueConfirmed}
            disabled={isSubmitting}
            onChange={(event) => onDiscontinueConfirmation(event.target.checked)}
          />
          <span>确认系统以后不再使用这条判断，也不会静默恢复。</span>
        </label>
      )}

      {correctionType && (
        <label className="correction-field correction-reason-field">
          <span>原因（可选）</span>
          <input
            value={reason}
            placeholder="补充现实变化或判断依据"
            disabled={isSubmitting}
            onChange={(event) => onReasonChange(event.target.value)}
          />
        </label>
      )}

      {isOffline && <p className="correction-inline-status is-offline">OFFLINE CACHE · 草稿会保留，恢复服务后才能提交。</p>}
      {error && <p className="correction-inline-status is-error" role="alert">{error.message}</p>}

      <div className="button-row correction-submit-row">
        <PrimaryButton disabled={!canSubmit} onClick={onSubmit}>
          {isSubmitting ? '正在保存' : '提交纠正'}
        </PrimaryButton>
        <SecondaryButton disabled={isSubmitting} onClick={onCancel}>取消</SecondaryButton>
      </div>
    </section>
  )
}
