import type { ExpressionMode } from '../types'

const modes: Array<{ id: ExpressionMode; title: string; copy: string }> = [
  { id: 'speak', title: '我先完整表达', copy: '自由输入目标、困境或已有计划。' },
  { id: 'ask', title: 'XUANOS 来问我', copy: '从一个高价值问题开始校准。' },
  { id: 'sort', title: '一起梳理', copy: '先说一句，系统协助拆开混乱。' },
]

interface ModeSelectorProps {
  value: ExpressionMode | null
  onChange: (mode: ExpressionMode) => void
  disabled?: boolean
}

export function ModeSelector({ value, onChange, disabled = false }: ModeSelectorProps) {
  return (
    <div className="mode-selector">
      {modes.map((mode, index) => (
        <button
          key={mode.id}
          className={`mode-option ${value === mode.id ? 'is-active' : ''}`}
          type="button"
          onClick={() => onChange(mode.id)}
          disabled={disabled}
          aria-label={`${mode.title}：${mode.copy}`}
        >
          <span className="mode-index">0{index + 1}</span>
          <span>
            <span className="mode-title">{mode.title}</span>
          </span>
        </button>
      ))}
    </div>
  )
}
