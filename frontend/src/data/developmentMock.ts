import type { SystemSnapshot } from '../types'

export function createDevelopmentMockSnapshot(now: string): SystemSnapshot {
  return {
    id: 'development-mock-snapshot',
    userId: 'development-mock',
    version: 0,
    sourceThreadId: null,
    sourceActionResultId: null,
    currentVector: '开发示例：等待真实目标',
    currentStage: '开发示例',
    currentAction: '连接后端后创建真实任务',
    realityBoundaries: [],
    effectivePatterns: [],
    hypotheses: [],
    recentRevisions: ['开发示例，不作为真实系统判断。'],
    userCorrections: [],
    revisionCount: 0,
    createdAt: now,
    updatedAt: null,
  }
}
