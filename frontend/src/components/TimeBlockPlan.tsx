import { timeBlocks } from '../data/mockData'

export function TimeBlockPlan() {
  return (
    <div className="time-block-list">
      {timeBlocks.map((block) => (
        <div className="time-block" key={block.label}>
          <span className="metric-label">{block.label}</span>
          <p>{block.task}</p>
        </div>
      ))}
    </div>
  )
}
