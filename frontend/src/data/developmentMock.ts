import type { SystemSnapshot } from '../types'

export function createDevelopmentMockSnapshot(now: string): SystemSnapshot {
  return {
    id: 'development-mock-snapshot',
    userId: 'development-mock',
    version: 0,
    sourceThreadId: null,
    sourceActionResultId: null,
    currentVector: '完成 XUANOS 静态前端原型',
    currentStage: '视觉系统确认',
    currentAction: '完成五个页面线框',
    realityBoundaries: ['只做五个核心页面', '暂不接真实 AI、登录或数据库'],
    effectivePatterns: [{ content: '有明确交付物时更容易启动', maturity: 'candidate' }],
    hypotheses: [{
      id: 'development-mock-hypothesis',
      content: '用户可能通过继续完善文档推迟真实开发',
      status: 'pending',
    }],
    recentRevisions: ['开发 Mock：尚未提交行动反馈'],
    userCorrections: ['开发 Mock：每周 3 次基础健身'],
    revisionCount: 0,
    createdAt: now,
    updatedAt: null,
  }
}
