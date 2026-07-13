import { understandingQuestionAt } from '../data/understandingQuestions'
import type { ActionObstacleCode, DemoSessionState, FeedbackPayload, InteractionStep } from '../types'
import { createInitialSession } from './initialState'

const STORAGE_KEY = 'xuanos:demo-user:integration-cache:v2'
const LEGACY_STORAGE_KEY = 'xuanos:demo-user:session:v1'

const validSteps = new Set<InteractionStep>([
  'idle',
  'expression_mode',
  'collecting_input',
  'asking_question',
  'reviewing_understanding',
  'understanding_confirmed',
  'plan_generated',
  'plan_modified',
  'plan_accepted',
  'action_pending',
  'feedback_submitted',
  'system_revised',
])

interface IntegrationCache {
  schemaVersion: 2
  savedAt: string
  lastThreadId: string | null
  server: Pick<
    DemoSessionState,
    'serverStep' | 'activeThread' | 'availableThreads' | 'serverSnapshot'
  >
  understanding: Pick<
    DemoSessionState,
    | 'activeUnderstandingSession'
    | 'understandingSessionId'
    | 'understandingStatus'
    | 'understandingConfirmedAt'
    | 'serverUnderstanding'
    | 'answerMeta'
    | 'submittedAnswers'
    | 'currentQuestionIndex'
    | 'currentQuestion'
    | 'corrections'
    | 'lastSuccessfulUnderstandingAt'
  >
  drafts: Pick<
    DemoSessionState,
    | 'expressionMode'
    | 'userInput'
    | 'currentAnswerDraft'
    | 'understandingAssessmentDraft'
    | 'understandingCorrectionDraft'
  >
  plans: Pick<
    DemoSessionState,
    | 'activePlanId'
    | 'currentPlan'
    | 'planVersions'
    | 'lastSuccessfulPlanAt'
    | 'lastViewedPlanId'
  >
  planDrafts: Pick<DemoSessionState, 'planModificationDraft'>
  actions: Pick<
    DemoSessionState,
    | 'latestActionResult'
    | 'actionResultId'
    | 'actionResultStatus'
    | 'actionResultSubmittedAt'
    | 'latestSnapshot'
    | 'previousSnapshot'
    | 'snapshotDiff'
    | 'latestActionHypothesis'
    | 'systemRevision'
    | 'systemRevisionAt'
  >
  feedbackDraft: Pick<DemoSessionState, 'actionFeedback'>
  correction: Pick<
    DemoSessionState,
    | 'activeCorrectionTarget'
    | 'correctionType'
    | 'correctionDraft'
    | 'correctionReason'
    | 'correctionDiscontinueConfirmed'
    | 'latestCorrectionId'
    | 'latestCorrectionAt'
    | 'latestCorrectionResult'
  >
  ui: Pick<
    DemoSessionState,
    | 'currentStep'
    | 'uiThreadStatus'
    | 'uiThreadPhase'
    | 'systemSnapshot'
  >
  mock?: IntegrationCache['ui']
}

const obstacleCodes = new Set<ActionObstacleCode>([
  'low_energy',
  'unclear_action',
  'lack_of_time',
  'emotional_resistance',
  'environment_interrupt',
  'missing_resource',
  'task_too_large',
  'other',
])

function restoreFeedbackDraft(
  fallback: FeedbackPayload,
  value: Partial<FeedbackPayload> & {
    started?: boolean
    completed?: boolean
    progress?: number
    obstacleDetail?: string
  } = {},
): FeedbackPayload {
  if ('resultStatus' in value) return { ...fallback, ...value }
  const rawObstacle = value.obstacleCode as string | null | undefined
  const legacyObstacle = rawObstacle === 'action_unclear' ? 'unclear_action' : rawObstacle
  const obstacleCode = obstacleCodes.has(legacyObstacle as ActionObstacleCode)
    ? legacyObstacle as ActionObstacleCode
    : null
  return {
    ...fallback,
    resultStatus: value.completed
      ? 'completed'
      : value.started === false
        ? 'not_completed'
        : value.started ? 'partially_completed' : null,
    progressPercent: value.progress ?? fallback.progressPercent,
    actualDurationMinutes: value.actualDurationMinutes ?? fallback.actualDurationMinutes,
    obstacleCode,
    userNote: value.obstacleDetail ?? '',
    energyChange: value.energyChange ?? '',
    unrealisticPart: value.unrealisticPart ?? '',
  }
}

function isStep(value: unknown): value is InteractionStep {
  return typeof value === 'string' && validSteps.has(value as InteractionStep)
}

function restoreV2(fallback: DemoSessionState, parsed: Partial<IntegrationCache>): DemoSessionState {
  const server = parsed.server
  const cachedUnderstanding = parsed.understanding
  const drafts = parsed.drafts
  const plans = parsed.plans
  const planDrafts = parsed.planDrafts
  const actions = parsed.actions
  const feedbackDraft = parsed.feedbackDraft
  const correction = parsed.correction
  const ui = parsed.ui ?? parsed.mock
  const serverSnapshot = server?.serverSnapshot ?? null
  const activeThread = server?.activeThread ?? null
  const cachedStep = isStep(ui?.currentStep) ? ui.currentStep : fallback.currentStep
  const currentStep = cachedStep === 'feedback_submitted' ? 'action_pending' : cachedStep
  const serverStep = isStep(server?.serverStep) ? server.serverStep : fallback.serverStep
  const legacyUi = ui as Partial<DemoSessionState> | undefined
  const submittedAnswers = cachedUnderstanding?.submittedAnswers ?? legacyUi?.answers ?? {}
  const currentQuestionIndex = cachedUnderstanding?.currentQuestionIndex
    ?? legacyUi?.currentQuestionIndex
    ?? 0
  const currentQuestion = cachedUnderstanding?.currentQuestion
    ?? (currentStep === 'asking_question' ? understandingQuestionAt(currentQuestionIndex) : null)
  const serverUnderstanding = cachedUnderstanding?.serverUnderstanding ?? legacyUi?.understanding ?? null
  const hasUnderstandingCache = Boolean(cachedUnderstanding?.understandingSessionId || serverUnderstanding)
  const cachedCurrentPlan = plans?.currentPlan ?? null
  const cachedPlanVersions = plans?.planVersions ?? []
  const hasPlanCache = Boolean(cachedCurrentPlan || cachedPlanVersions.length)
  const snapshotCandidates = [
    serverSnapshot,
    actions?.latestSnapshot,
    correction?.latestCorrectionResult?.snapshot,
  ].filter((snapshot): snapshot is NonNullable<typeof snapshot> => Boolean(snapshot))
  const latestSnapshot = snapshotCandidates.reduce(
    (latest, snapshot) => !latest || snapshot.version >= latest.version ? snapshot : latest,
    null as DemoSessionState['latestSnapshot'],
  )
  const latestActionResult = actions?.latestActionResult ?? legacyUi?.latestActionResult ?? null
  const latestCorrectionResult = correction?.latestCorrectionResult ?? null
  return {
    ...fallback,
    ...ui,
    schemaVersion: 2,
    currentStep,
    serverStep,
    activeThread,
    activeThreadId: activeThread?.id ?? parsed.lastThreadId ?? null,
    availableThreads: server?.availableThreads ?? [],
    serverSnapshot: latestSnapshot,
    snapshotId: latestSnapshot?.id ?? null,
    snapshotVersion: latestSnapshot?.version ?? null,
    isOfflineCache: Boolean(activeThread || latestSnapshot),
    dataSource: activeThread || latestSnapshot ? 'cache' : fallback.dataSource,
    isLoading: false,
    apiError: null,
    activeUnderstandingSession: cachedUnderstanding?.activeUnderstandingSession ?? null,
    understandingSessionId: cachedUnderstanding?.understandingSessionId ?? null,
    understandingStatus: cachedUnderstanding?.understandingStatus ?? 'idle',
    understandingConfirmedAt: cachedUnderstanding?.understandingConfirmedAt ?? null,
    serverUnderstanding,
    understanding: serverUnderstanding,
    understandingRequestStatus: 'idle',
    understandingApiError: null,
    understandingSource: hasUnderstandingCache ? 'cache' : fallback.understandingSource,
    lastSuccessfulUnderstandingAt: cachedUnderstanding?.lastSuccessfulUnderstandingAt ?? null,
    expressionMode: drafts?.expressionMode ?? legacyUi?.expressionMode ?? null,
    userInput: drafts?.userInput ?? legacyUi?.userInput ?? '',
    currentAnswerDraft: drafts?.currentAnswerDraft ?? '',
    understandingAssessmentDraft: drafts?.understandingAssessmentDraft ?? null,
    understandingCorrectionDraft: drafts?.understandingCorrectionDraft ?? '',
    answers: submittedAnswers,
    submittedAnswers,
    answerMeta: cachedUnderstanding?.answerMeta ?? {},
    currentQuestionIndex,
    currentQuestion,
    corrections: cachedUnderstanding?.corrections ?? legacyUi?.corrections ?? [],
    currentPlan: cachedCurrentPlan,
    planVersions: cachedPlanVersions,
    activePlanId: plans?.activePlanId ?? cachedCurrentPlan?.id ?? null,
    planRequestStatus: 'idle',
    planApiError: null,
    planSource: hasPlanCache ? 'cache' : fallback.planSource,
    lastSuccessfulPlanAt: plans?.lastSuccessfulPlanAt ?? cachedCurrentPlan?.updatedAt ?? cachedCurrentPlan?.createdAt ?? null,
    lastViewedPlanId: plans?.lastViewedPlanId ?? cachedCurrentPlan?.id ?? null,
    planModificationDraft: {
      ...fallback.planModificationDraft,
      ...planDrafts?.planModificationDraft,
    },
    actionFeedback: restoreFeedbackDraft(
      fallback.actionFeedback,
      feedbackDraft?.actionFeedback ?? legacyUi?.actionFeedback,
    ),
    latestActionResult,
    actionResultId: actions?.actionResultId ?? latestActionResult?.id ?? null,
    actionResultStatus: actions?.actionResultStatus ?? latestActionResult?.resultStatus ?? null,
    actionResultSubmittedAt: actions?.actionResultSubmittedAt ?? latestActionResult?.submittedAt ?? null,
    actionResultRequestStatus: 'idle',
    actionResultApiError: null,
    actionResultSource: latestActionResult ? 'cache' : fallback.actionResultSource,
    latestSnapshot,
    previousSnapshot: actions?.previousSnapshot ?? null,
    snapshotDiff: actions?.snapshotDiff ?? null,
    latestActionHypothesis: actions?.latestActionHypothesis ?? null,
    systemRevision: actions?.systemRevision ?? legacyUi?.systemRevision ?? null,
    systemRevisionSource: actions?.systemRevision ? 'cache' : fallback.systemRevisionSource,
    systemRevisionAt: actions?.systemRevisionAt ?? latestActionResult?.submittedAt ?? null,
    activeCorrectionTarget: correction?.activeCorrectionTarget ?? null,
    correctionType: correction?.correctionType ?? null,
    correctionDraft: correction?.correctionDraft ?? '',
    correctionReason: correction?.correctionReason ?? '',
    correctionDiscontinueConfirmed: correction?.correctionDiscontinueConfirmed ?? false,
    correctionRequestStatus: 'idle',
    correctionApiError: null,
    latestCorrectionId: correction?.latestCorrectionId ?? latestCorrectionResult?.correction.id ?? null,
    latestCorrectionAt: correction?.latestCorrectionAt ?? latestCorrectionResult?.correction.createdAt ?? null,
    latestCorrectionResult,
    correctionSource: latestCorrectionResult ? 'cache' : fallback.correctionSource,
    systemSnapshot: latestSnapshot ?? ui?.systemSnapshot ?? fallback.systemSnapshot,
  }
}

function restoreLegacy(fallback: DemoSessionState): DemoSessionState {
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return fallback
    const legacy = JSON.parse(raw) as Partial<DemoSessionState>
    return {
      ...fallback,
      expressionMode: legacy.expressionMode ?? null,
      userInput: legacy.userInput ?? '',
      currentAnswerDraft: legacy.currentAnswerDraft ?? '',
      understandingCorrectionDraft: legacy.understandingCorrectionDraft ?? '',
      correctionDraft: legacy.correctionDraft ?? '',
      correctionReason: legacy.correctionReason ?? '',
    }
  } catch {
    return fallback
  }
}

export function restoreIntegrationState(): DemoSessionState {
  const fallback = createInitialSession()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return restoreLegacy(fallback)
    const parsed = JSON.parse(raw) as Partial<IntegrationCache>
    if (parsed.schemaVersion !== 2) return restoreLegacy(fallback)
    return restoreV2(fallback, parsed)
  } catch {
    return restoreLegacy(fallback)
  }
}

export function writeIntegrationCache(state: DemoSessionState) {
  const cache: IntegrationCache = {
    schemaVersion: 2,
    savedAt: new Date().toISOString(),
    lastThreadId: state.activeThreadId,
    server: {
      serverStep: state.serverStep,
      activeThread: state.activeThread,
      availableThreads: state.availableThreads,
      serverSnapshot: state.serverSnapshot,
    },
    understanding: {
      activeUnderstandingSession: state.activeUnderstandingSession,
      understandingSessionId: state.understandingSessionId,
      understandingStatus: state.understandingStatus,
      understandingConfirmedAt: state.understandingConfirmedAt,
      serverUnderstanding: state.serverUnderstanding,
      answerMeta: state.answerMeta,
      submittedAnswers: state.submittedAnswers,
      currentQuestionIndex: state.currentQuestionIndex,
      currentQuestion: state.currentQuestion,
      corrections: state.corrections,
      lastSuccessfulUnderstandingAt: state.lastSuccessfulUnderstandingAt,
    },
    drafts: {
      expressionMode: state.expressionMode,
      userInput: state.userInput,
      currentAnswerDraft: state.currentAnswerDraft,
      understandingAssessmentDraft: state.understandingAssessmentDraft,
      understandingCorrectionDraft: state.understandingCorrectionDraft,
    },
    plans: {
      activePlanId: state.activePlanId,
      currentPlan: state.currentPlan,
      planVersions: state.planVersions,
      lastSuccessfulPlanAt: state.lastSuccessfulPlanAt,
      lastViewedPlanId: state.lastViewedPlanId,
    },
    planDrafts: {
      planModificationDraft: state.planModificationDraft,
    },
    actions: {
      latestActionResult: state.latestActionResult,
      actionResultId: state.actionResultId,
      actionResultStatus: state.actionResultStatus,
      actionResultSubmittedAt: state.actionResultSubmittedAt,
      latestSnapshot: state.latestSnapshot,
      previousSnapshot: state.previousSnapshot,
      snapshotDiff: state.snapshotDiff,
      latestActionHypothesis: state.latestActionHypothesis,
      systemRevision: state.systemRevision,
      systemRevisionAt: state.systemRevisionAt,
    },
    feedbackDraft: {
      actionFeedback: state.actionFeedback,
    },
    correction: {
      activeCorrectionTarget: state.activeCorrectionTarget,
      correctionType: state.correctionType,
      correctionDraft: state.correctionDraft,
      correctionReason: state.correctionReason,
      correctionDiscontinueConfirmed: state.correctionDiscontinueConfirmed,
      latestCorrectionId: state.latestCorrectionId,
      latestCorrectionAt: state.latestCorrectionAt,
      latestCorrectionResult: state.latestCorrectionResult,
    },
    ui: {
      currentStep: state.currentStep,
      uiThreadStatus: state.uiThreadStatus,
      uiThreadPhase: state.uiThreadPhase,
      systemSnapshot: state.systemSnapshot,
    },
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
    window.localStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    // The current in-memory state remains usable without browser storage.
  }
}

export function clearIntegrationCache() {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
    window.localStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    // The reducer still resets the in-memory demo state.
  }
}
