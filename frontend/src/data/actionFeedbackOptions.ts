import type { ActionObstacleCode, ActionResultStatus } from '../types'

export const actionResultOptions: Array<{
  code: ActionResultStatus
  label: string
  description: string
}> = [
  { code: 'completed', label: '已完成', description: '达到本次完成标准' },
  { code: 'partially_completed', label: '部分完成', description: '已经推进，但尚未收束' },
  { code: 'not_completed', label: '未开始', description: '本次没有进入行动' },
  { code: 'abandoned', label: '中途停止', description: '开始后主动停止' },
]

export const actionObstacleOptions: Array<{ code: ActionObstacleCode; label: string }> = [
  { code: 'low_energy', label: '精力不足' },
  { code: 'unclear_action', label: '行动不明确' },
  { code: 'lack_of_time', label: '时间不足' },
  { code: 'emotional_resistance', label: '情绪阻力' },
  { code: 'environment_interrupt', label: '环境打断' },
  { code: 'missing_resource', label: '资源缺失' },
  { code: 'task_too_large', label: '任务过大' },
  { code: 'other', label: '其他' },
]
