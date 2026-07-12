import { PrimaryButton } from './PrimaryButton'
import { SecondaryButton } from './SecondaryButton'

interface QuestionCardProps {
  prompt: string
  hint: string
  value: string
  index: number
  total: number
  onChange: (value: string) => void
  onSubmit: () => void
  onBack?: () => void
}

export function QuestionCard({ prompt, hint, value, index, total, onChange, onSubmit, onBack }: QuestionCardProps) {
  return (
    <div>
      <div className="question-progress">QUESTION {index + 1} / {total}</div>
      <p className="question-copy">{prompt}</p>
      <p className="question-hint">{hint}</p>
      <textarea className="short-input question-answer" value={value} onChange={(event) => onChange(event.target.value)} placeholder="写下当前最真实的答案。" />
      <div className="button-row">
        {onBack && <SecondaryButton onClick={onBack}>上一题</SecondaryButton>}
        <PrimaryButton onClick={onSubmit} disabled={!value.trim()}>{index === total - 1 ? '生成理解摘要' : '确认并继续'}</PrimaryButton>
      </div>
    </div>
  )
}
