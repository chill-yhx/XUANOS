import type {
  DemoSessionState,
  FeedbackPayload,
  PlanModificationReason,
  PlanVersion,
  QuestionId,
  UnderstandingSummary,
} from '../types'

export const initialFeedback: FeedbackPayload = {
  resultStatus: null,
  progressPercent: 0,
  actualDurationMinutes: null,
  obstacleCode: null,
  userNote: '',
  energyChange: '',
  unrealisticPart: '',
  planId: null,
  planItemId: null,
  actionIdentifier: null,
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
    activePlanId: null,
    planRequestStatus: 'idle',
    planApiError: null,
    planSource: 'mock',
    lastSuccessfulPlanAt: null,
    lastViewedPlanId: null,
    planModificationDraft: {
      reason: null,
      userChoice: '',
      expectedImpactAcknowledged: false,
    },
    actionFeedback: { ...initialFeedback },
    actionResultId: null,
    actionResultStatus: null,
    actionResultSubmittedAt: null,
    actionResultRequestStatus: 'idle',
    actionResultApiError: null,
    actionResultSource: 'mock',
    latestSnapshot: null,
    previousSnapshot: null,
    snapshotDiff: null,
    latestActionHypothesis: null,
    systemRevisionSource: 'mock',
    systemRevisionAt: null,
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
