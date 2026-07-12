import { feedbackObstacles } from '../data/mockData'
import type { FeedbackPayload } from '../types'
import { PrimaryButton } from './PrimaryButton'

interface FeedbackFormProps {
  value: FeedbackPayload
  onChange: (value: Partial<FeedbackPayload>) => void
  onSubmit: () => void
}

export function FeedbackForm({ value, onChange, onSubmit }: FeedbackFormProps) {
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
          {['少于 30 分钟', '约 45 分钟', '超过 1 小时'].map((option) => (
            <button key={option} className={`choice-button ${value.duration === option ? 'is-active' : ''}`} type="button" onClick={() => onChange({ duration: option })}>{option}</button>
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
                <button key={option} className={`choice-button ${value.obstacle === option ? 'is-active' : ''}`} type="button" onClick={() => onChange({ obstacle: option })}>{option}</button>
              ))}
            </div>
          </fieldset>

          <fieldset className="feedback-fieldset">
            <legend>情绪或精力变化</legend>
            <textarea value={value.energyChange} onChange={(event) => onChange({ energyChange: event.target.value })} placeholder="开始前后有什么变化？" />
          </fieldset>

          <fieldset className="feedback-fieldset">
            <legend>原计划哪里不现实</legend>
            <textarea value={value.note} onChange={(event) => onChange({ note: event.target.value })} />
          </fieldset>
        </div>
      </details>

      <PrimaryButton type="submit" disabled={!value.duration || !value.obstacle}>提交反馈</PrimaryButton>
    </form>
  )
}
