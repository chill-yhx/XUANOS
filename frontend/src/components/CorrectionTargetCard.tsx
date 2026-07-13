import type { CorrectionTarget } from '../types'

interface CorrectionTargetCardProps {
  target: CorrectionTarget
  isActive: boolean
  onSelect: (target: CorrectionTarget) => void
}

const areaLabels: Record<CorrectionTarget['area'], string> = {
  vector: 'FOCUS',
  action: 'NEXT ACTION',
  boundary: 'BOUNDARY',
  pattern: 'PATTERN',
  hypothesis: 'HYPOTHESIS',
  state: 'STATE',
}

export function CorrectionTargetCard({ target, isActive, onSelect }: CorrectionTargetCardProps) {
  return (
    <article className={`correction-target-card${isActive ? ' is-active' : ''}`}>
      <div>
        <div className="micro-label">{areaLabels[target.area]}</div>
        <h3>{target.label}</h3>
      </div>
      <p>{target.originalValue}</p>
      <button
        className="correction-target-trigger"
        type="button"
        aria-pressed={isActive}
        onClick={() => onSelect(target)}
      >
        {isActive ? '正在纠正' : '纠正此条'}
      </button>
    </article>
  )
}
