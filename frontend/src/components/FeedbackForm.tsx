import { feedbackObstacles } from '../data/mockData'
import type { FeedbackPayload } from '../types'
import { PrimaryButton } from './PrimaryButton'

interface FeedbackFormProps {
  value: FeedbackPayload
  onChange: (value: Partial<FeedbackPayload>) => void
  onSubmit: () => void
}

export function FeedbackForm({ value, onChange, onSubmit }: FeedbackFormProps) {
  const durationOptions = [
    { label: '少于 30 分钟', minutes: 25 },
    { label: '约 45 分钟', minutes: 45 },
    { label: '超过 1 小时', minutes: 75 },
  ]

  return (
    <form
      className="feedback-form"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <fieldset className="feedback-fieldset">
        <legend>是否开始</legend>
        <div className="feedback-choice-row">
          <button className={`choice-button ${value.started ? 'is-active' : ''}`} type="button" onClick={() => onChange({ started: true })}>已开始</button>
          <button className={`choice-button ${!value.started ? 'is-active' : ''}`} type="button" onClick={() => onChange({ started: false, completed: false, progress: 0 })}>未开始</button>
        </div>
      </fieldset>

      <fieldset className="feedback-fieldset">
        <legend>是否完成</legend>
        <div className="feedback-choice-row">
          <button className={`choice-button ${value.completed ? 'is-active' : ''}`} type="button" onClick={() => onChange({ started: true, completed: true, progress: 100 })}>已完成</button>
          <button className={`choice-button ${!value.completed ? 'is-active' : ''}`} type="button" onClick={() => onChange({ completed: false })}>未完成</button>
        </div>
      </fieldset>

      <fieldset className="feedback-fieldset">
        <legend>完成比例</legend>
        <div className="range-wrap">
          <input type="range" min="0" max="100" value={value.progress} onChange={(event) => onChange({ progress: Number(event.target.value), completed: Number(event.target.value) === 100 })} />
          <output className="range-value">{value.progress}%</output>
        </div>
      </fieldset>

      <fieldset className="feedback-fieldset">
        <legend>实际用时</legend>
        <div className="feedback-choice-row">
          {durationOptions.map((option) => (
            <button key={option.minutes} className={`choice-button ${value.actualDurationMinutes === option.minutes ? 'is-active' : ''}`} type="button" onClick={() => onChange({ actualDurationMinutes: option.minutes })}>{option.label}</button>
          ))}
        </div>
      </fieldset>

      <details className="feedback-more" open>
        <summary>补充现实阻力</summary>
        <div className="feedback-more-content">
          <fieldset className="feedback-fieldset">
            <legend>最大阻力</legend>
            <div className="feedback-choice-row">
              {feedbackObstacles.map((option) => (
                <button key={option.code} className={`choice-button ${value.obstacleCode === option.code ? 'is-active' : ''}`} type="button" onClick={() => onChange({ obstacleCode: option.code })}>{option.label}</button>
              ))}
            </div>
          </fieldset>

          <fieldset className="feedback-fieldset">
            <legend>情绪或精力变化</legend>
            <textarea value={value.energyChange} onChange={(event) => onChange({ energyChange: event.target.value })} placeholder="开始前后有什么变化？" />
          </fieldset>

          <fieldset className="feedback-fieldset">
            <legend>原计划哪里不现实</legend>
            <textarea value={value.unrealisticPart} onChange={(event) => onChange({ unrealisticPart: event.target.value })} />
          </fieldset>
        </div>
      </details>

      <PrimaryButton type="submit" disabled={value.actualDurationMinutes === null || !value.obstacleCode}>提交反馈</PrimaryButton>
    </form>
  )
}
