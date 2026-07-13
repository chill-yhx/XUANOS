import { actionObstacleOptions, actionResultOptions } from '../data/actionFeedbackOptions'
import type { FeedbackPayload } from '../types'
import { PrimaryButton } from './PrimaryButton'

interface FeedbackFormProps {
  value: FeedbackPayload
  onChange: (value: Partial<FeedbackPayload>) => void
  onSubmit: () => void
  isLoading?: boolean
  disabled?: boolean
}

export function FeedbackForm({
  value,
  onChange,
  onSubmit,
  isLoading = false,
  disabled = false,
}: FeedbackFormProps) {
  const showProgress = value.resultStatus === 'partially_completed' || value.resultStatus === 'abandoned'
  const validProgress = value.resultStatus !== 'partially_completed'
    || value.progressPercent > 0 && value.progressPercent < 100
  const canSubmit = Boolean(
    value.resultStatus
    && value.actualDurationMinutes !== null
    && Number.isInteger(value.actualDurationMinutes)
    && value.actualDurationMinutes >= 0
    && value.obstacleCode
    && validProgress,
  )

  const selectStatus = (status: NonNullable<FeedbackPayload['resultStatus']>) => {
    const progressPercent = status === 'completed'
      ? 100
      : status === 'not_completed'
        ? 0
        : value.progressPercent > 0 && value.progressPercent < 100
          ? value.progressPercent
          : status === 'partially_completed' ? 50 : 0
    onChange({ resultStatus: status, progressPercent })
  }

  return (
    <form
      className="feedback-form action-result-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (canSubmit && !isLoading && !disabled) onSubmit()
      }}
    >
      <fieldset className="feedback-fieldset" disabled={isLoading || disabled}>
        <legend>行动结果</legend>
        <div className="result-status-grid">
          {actionResultOptions.map((option) => (
            <button
              key={option.code}
              className={`result-status-option ${value.resultStatus === option.code ? 'is-active' : ''}`}
              type="button"
              onClick={() => selectStatus(option.code)}
            >
              <strong>{option.label}</strong>
              <span>{option.description}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {showProgress && (
        <fieldset className="feedback-fieldset" disabled={isLoading || disabled}>
          <legend>完成比例</legend>
          <div className="range-wrap">
            <input
              type="range"
              min="0"
              max="99"
              value={value.progressPercent}
              onChange={(event) => onChange({ progressPercent: Number(event.target.value) })}
            />
            <output className="range-value">{value.progressPercent}%</output>
          </div>
        </fieldset>
      )}

      <fieldset className="feedback-fieldset" disabled={isLoading || disabled}>
        <legend>实际用时（分钟）</legend>
        <input
          className="feedback-number-input"
          type="number"
          min="0"
          max="10080"
          step="1"
          value={value.actualDurationMinutes ?? ''}
          onChange={(event) => {
            const next = event.target.value === '' ? null : Number(event.target.value)
            onChange({ actualDurationMinutes: next })
          }}
          placeholder="例如 45"
        />
      </fieldset>

      <fieldset className="feedback-fieldset" disabled={isLoading || disabled}>
        <legend>最大阻力</legend>
        <div className="feedback-choice-row">
          {actionObstacleOptions.map((option) => (
            <button
              key={option.code}
              className={`choice-button ${value.obstacleCode === option.code ? 'is-active' : ''}`}
              type="button"
              onClick={() => onChange({ obstacleCode: option.code })}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="feedback-fieldset" disabled={isLoading || disabled}>
        <legend>补充说明（可选）</legend>
        <textarea
          value={value.userNote}
          onChange={(event) => onChange({ userNote: event.target.value })}
          placeholder="记录本次行动中最关键的现实信息。"
        />
      </fieldset>

      <details className="feedback-more">
        <summary>补充系统校准信息</summary>
        <div className="feedback-more-content">
          <fieldset className="feedback-fieldset" disabled={isLoading || disabled}>
            <legend>情绪或精力变化</legend>
            <textarea
              value={value.energyChange}
              onChange={(event) => onChange({ energyChange: event.target.value })}
              placeholder="开始前后有什么变化？"
            />
          </fieldset>
          <fieldset className="feedback-fieldset" disabled={isLoading || disabled}>
            <legend>原计划哪里不现实</legend>
            <textarea
              value={value.unrealisticPart}
              onChange={(event) => onChange({ unrealisticPart: event.target.value })}
            />
          </fieldset>
        </div>
      </details>

      <PrimaryButton type="submit" disabled={!canSubmit || isLoading || disabled}>
        {isLoading ? '正在写入系统' : '提交行动结果'}
      </PrimaryButton>
    </form>
  )
}
