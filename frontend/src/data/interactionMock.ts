import type {
  DemoSessionState,
  FeedbackPayload,
  PlanModificationReason,
  PlanVersion,
  QuestionId,
  SystemRevision,
  SystemSnapshot,
  UnderstandingSummary,
} from '../types'

export const initialFeedback: FeedbackPayload = {
  started: true,
  completed: false,
  progress: 40,
  actualDurationMinutes: 45,
  obstacleCode: 'action_unclear',
  obstacleDetail: '',
  energyChange: '开始后更专注',
  unrealisticPart: '开始前仍花了较多时间确认细节，原计划需要更快进入第一版界面。',
}

export function createInitialSession(): DemoSessionState {
  const now = new Date().toISOString()

  return {
    schemaVersion: 2,
    currentStep: 'idle',
    serverStep: 'idle',
    isLoading: false,
    apiError: null,
    isOfflineCache: false,
    dataSource: 'mock',
    activeThreadId: null,
    snapshotId: null,
    snapshotVersion: null,
    availableThreads: [],
    activeThread: null,
    uiThreadStatus: '等待校准',
    uiThreadPhase: '视觉系统确认',
    activeUnderstandingSession: null,
    understandingSessionId: null,
    understandingStatus: 'idle',
    understandingConfirmedAt: null,
    serverUnderstanding: null,
    understandingRequestStatus: 'idle',
    understandingApiError: null,
    understandingSource: 'mock',
    lastSuccessfulUnderstandingAt: null,
    answerMeta: {},
    latestActionResult: null,
    serverSnapshot: null,
    expressionMode: null,
    userInput: '',
    currentAnswerDraft: '',
    understandingAssessmentDraft: null,
    understandingCorrectionDraft: '',
    answers: {},
    submittedAnswers: {},
    currentQuestionIndex: 0,
    currentQuestion: null,
    understanding: null,
    corrections: [],
    currentPlan: null,
    planVersions: [],
    actionFeedback: { ...initialFeedback },
    systemRevision: null,
    systemSnapshot: {
      id: null,
      userId: 'demo-user',
      version: 0,
      sourceThreadId: null,
      sourceActionResultId: null,
      currentVector: '完成 XUANOS 静态前端原型',
      currentStage: '视觉系统确认',
      currentAction: '完成五个页面线框',
      realityBoundaries: ['只做五个核心页面', '不接后端、真实 AI、登录或数据库'],
      effectivePatterns: [{ content: '有明确交付物时更容易启动', maturity: 'candidate' }],
      hypotheses: [{ id: 'mock-hypothesis-1', content: '用户可能通过继续完善文档推迟真实开发', status: 'pending' }],
      recentRevisions: ['尚未提交本轮行动反馈'],
      userCorrections: ['健身是每周 3 次的维持目标'],
      revisionCount: 0,
      createdAt: now,
      updatedAt: null,
    },
  }
}

export function generateUnderstanding(
  userInput: string,
  answers: Partial<Record<QuestionId, string>>,
): UnderstandingSummary {
  return {
    realGoal: answers.desired_result || userInput || '完成 XUANOS 静态前端原型',
    foundation: answers.current_foundation || '现有 MVP、视觉规范与页面线框已经齐备。',
    constraints: answers.real_constraints || '只做五个核心页面，暂不接后端与真实 AI。',
    tension: '规格已经足够，主要矛盾是继续完善说明可能推迟真实开发。',
    uncertain: '能否把当前判断转化为一次真实行动，仍需本轮反馈验证。',
  }
}

export function generatePlan(state: DemoSessionState): PlanVersion {
  return {
    id: `plan-v${state.planVersions.length + 1}-${Date.now()}`,
    version: state.planVersions.length + 1,
    status: 'generated',
    mainGoal: state.understanding?.realGoal || '完成 XUANOS 静态前端原型',
    maintenanceGoals: ['每周 3 次基础健身'],
    pausedGoals: ['Flutter 客户端', '完整商业系统'],
    removedItems: ['本阶段继续扩展视觉方案', '新增 MVP 范围外页面'],
    stage: 'Mock 交互闭环',
    singleAction: '完成五个页面的状态接线',
    completionStandard: '从首页可以完整走到“我的系统”更新',
    reviewCondition: '完整走通一次流程后，或连续两次未开始时',
    workload: '中等',
    systemRecommendation: '先完成五页交互闭环，再继续扩展产品范围。',
    isUserFinalChoice: false,
    createdAt: new Date().toISOString(),
  }
}

export function createModifiedPlan(
  state: DemoSessionState,
  reason: PlanModificationReason,
  userChoice: string,
): PlanVersion | null {
  if (!state.currentPlan) return null

  const impact = reason === 'health_or_safety'
    ? '优先保护身体与安全，系统将降低负荷并提前复查。'
    : '计划范围或完成时间可能变化，系统将在一次真实执行后复查。'

  return {
    ...state.currentPlan,
    id: `plan-v${state.planVersions.length + 1}-${Date.now()}`,
    version: state.planVersions.length + 1,
    status: 'generated',
    singleAction: userChoice,
    userFinalChoice: userChoice,
    modificationReason: reason,
    expectedImpact: impact,
    isUserFinalChoice: true,
    createdAt: new Date().toISOString(),
  }
}

export function reviseSystem(
  snapshot: SystemSnapshot,
  feedback: FeedbackPayload,
  plan: PlanVersion,
): { snapshot: SystemSnapshot; revision: SystemRevision } {
  const actualResult = feedback.started
    ? `${feedback.progress}% 完成，实际用时 ${feedback.actualDurationMinutes ?? 0} 分钟，最大阻力为“${feedback.obstacleCode}”。`
    : `本次没有开始，最大阻力为“${feedback.obstacleCode}”。`

  let revisedJudgment = '任务需要更小、更明确的启动动作。'
  let nextAdjustment = '先完成首页与理解页的状态接线。'
  let nextStage = '启动阻力校准'
  let effectivePattern = '任务缩小到单一交付物时更容易启动'

  if (feedback.completed) {
    revisedJudgment = '明确范围后可以完成闭环，下一轮应转向真实可用性验证。'
    nextAdjustment = '完整复测五页流程并记录阻塞点。'
    nextStage = '闭环复测'
    effectivePattern = '以完整可运行闭环作为完成标准有效'
  } else if (feedback.started && feedback.progress >= 50) {
    revisedJudgment = '计划方向有效，但任务范围仍需按剩余工作收缩。'
    nextAdjustment = '完成剩余页面接线，不新增视觉细节。'
    nextStage = 'Mock 闭环收束'
  } else if (!feedback.started) {
    nextAdjustment = '打开项目并只完成表达方式选择的状态接线。'
  }

  const revision: SystemRevision = {
    originalJudgment: `当前行动“${plan.singleAction}”可以在本阶段推进。`,
    actualResult,
    revisedJudgment,
    nextAdjustment,
  }

  return {
    revision,
    snapshot: {
      ...snapshot,
      version: snapshot.version + 1,
      currentVector: plan.mainGoal,
      currentStage: nextStage,
      currentAction: nextAdjustment,
      effectivePatterns: snapshot.effectivePatterns.some((item) => item.content === effectivePattern)
        ? snapshot.effectivePatterns
        : [...snapshot.effectivePatterns, { content: effectivePattern, maturity: 'candidate' }],
      hypotheses: feedback.completed
        ? snapshot.hypotheses.filter((item) => !item.content.includes('完善文档'))
        : snapshot.hypotheses,
      recentRevisions: [revisedJudgment, ...snapshot.recentRevisions].slice(0, 3),
      userCorrections: feedback.unrealisticPart
        ? [feedback.unrealisticPart, ...snapshot.userCorrections].slice(0, 4)
        : snapshot.userCorrections,
      revisionCount: snapshot.revisionCount + 1,
      updatedAt: new Date().toISOString(),
    },
  }
}
