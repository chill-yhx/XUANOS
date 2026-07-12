import type { SystemViewMode } from '../types'

const options: Array<{ id: SystemViewMode; label: string }> = [
  { id: 'profile', label: '档案模式' },
  { id: 'diary', label: '日记模式' },
  { id: 'mixed', label: '混合模式' },
]

interface SystemViewToggleProps {
  value: SystemViewMode
  onChange: (mode: SystemViewMode) => void
}

export function SystemViewToggle({ value, onChange }: SystemViewToggleProps) {
  return (
    <div className="system-view-toggle" aria-label="我的系统展示模式">
      {options.map((option) => (
        <button
          key={option.id}
          className={`system-toggle-button ${value === option.id ? 'is-active' : ''}`}
          type="button"
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
