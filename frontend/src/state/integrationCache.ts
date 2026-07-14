import { readAuthSession } from '../api/authSession'
import { understandingQuestionAt } from '../data/understandingQuestions'
import type { ActionObstacleCode, DemoSessionState, FeedbackPayload, InteractionStep } from '../types'
import { createInitialSession } from './initialState'
import { recoverServerStep, uiRecoveryStep } from './threadRecovery'

const USER_STORAGE_PREFIX = 'xuanos:integration-cache:v4:user'
const THREAD_STORAGE_PREFIX = 'xuanos:integration-cache:v4:thread'
const LEGACY_STORAGE_PREFIX = 'xuanos:integration-cache:v3'

function userStorageKey(userId: string) {
  return `${USER_STORAGE_PREFIX}:${userId}`
}

function threadStorageKey(userId: string, threadId: string) {
  return `${THREAD_STORAGE_PREFIX}:${userId}:${threadId}`
}

function legacyStorageKey(userId: string) {
  return `${LEGACY_STORAGE_PREFIX}:${userId}`
}

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

type UnderstandingCache = Pick<
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

type DraftCache = Pick<
  DemoSessionState,
  | 'expressionMode'
  | 'userInput'
  | 'currentAnswerDraft'
  | 'understandingAssessmentDraft'
  | 'understandingCorrectionDraft'
>

type PlanCache = Pick<
  DemoSessionState,
  | 'activePlanId'
  | 'currentPlan'
  | 'planVersions'
  | 'lastSuccessfulPlanAt'
  | 'lastViewedPlanId'
>

type ActionCache = Pick<
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

type CorrectionCache = Pick<
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

interface CacheGroups {
  understanding: UnderstandingCache
  drafts: DraftCache
  plans: PlanCache
  planDrafts: Pick<DemoSessionState, 'planModificationDraft'>
  actions: ActionCache
  feedbackDraft: Pick<DemoSessionState, 'actionFeedback'>
  correction: CorrectionCache
  ui: Pick<DemoSessionState, 'currentStep' | 'uiThreadStatus' | 'uiThreadPhase' | 'systemSnapshot'>
  mock?: CacheGroups['ui']
}

interface UserIntegrationCache {
  schemaVersion: 4
  userId: string
  savedAt: string
  lastThreadId: string | null
  availableThreads: DemoSessionState['availableThreads']
  latestSnapshot: DemoSessionState['serverSnapshot']
}

interface ThreadIntegrationCache extends CacheGroups {
  schemaVersion: 4
  userId: string
  threadId: string
  savedAt: string
  server: Pick<DemoSessionState, 'serverStep' | 'activeThread' | 'serverSnapshot'>
}

interface LegacyIntegrationCache extends CacheGroups {
  schemaVersion: 3
  userId: string
  savedAt: string
  lastThreadId: string | null
  server: Pick<DemoSessionState, 'serverStep' | 'activeThread' | 'availableThreads' | 'serverSnapshot'>
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

function readJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function readUserCache(userId: string): UserIntegrationCache | null {
  const parsed = readJson(userStorageKey(userId)) as Partial<UserIntegrationCache> | null
  if (
    !parsed
    || parsed.schemaVersion !== 4
    || parsed.userId !== userId
    || !Array.isArray(parsed.availableThreads)
    || parsed.availableThreads.some((thread) => thread.userId !== userId)
  ) return null
  if (parsed.latestSnapshot?.userId && parsed.latestSnapshot.userId !== userId) return null
  return parsed as UserIntegrationCache
}

function readThreadCache(userId: string, threadId: string): ThreadIntegrationCache | null {
  const parsed = readJson(threadStorageKey(userId, threadId)) as Partial<ThreadIntegrationCache> | null
  if (
    !parsed
    || parsed.schemaVersion !== 4
    || parsed.userId !== userId
    || parsed.threadId !== threadId
    || parsed.server?.activeThread?.id !== threadId
    || parsed.server.activeThread.userId !== userId
  ) return null
  if (parsed.server.serverSnapshot?.userId && parsed.server.serverSnapshot.userId !== userId) return null
  return parsed as ThreadIntegrationCache
}

function restoreCacheState(
  fallback: DemoSessionState,
  cache: ThreadIntegrationCache | LegacyIntegrationCache,
  availableThreads: DemoSessionState['availableThreads'],
): DemoSessionState {
  const cachedUnderstanding = cache.understanding
  const drafts = cache.drafts
  const plans = cache.plans
  const actions = cache.actions
  const correction = cache.correction
  const ui = cache.ui ?? cache.mock
  const activeThread = cache.server.activeThread
  const serverSnapshot = cache.server.serverSnapshot ?? null
  const storedServerStep = isStep(cache.server.serverStep) ? cache.server.serverStep : fallback.serverStep
  const serverStep = recoverServerStep(
    storedServerStep,
    cachedUnderstanding?.activeUnderstandingSession?.status ?? null,
    Boolean(cachedUnderstanding?.serverUnderstanding),
  )
  const cachedStep = isStep(ui?.currentStep) ? ui.currentStep : fallback.currentStep
  const normalizedCachedStep = cachedStep === 'feedback_submitted' ? 'action_pending' : cachedStep
  const cachedPlan = plans?.currentPlan ?? null
  const canRestoreFeedbackDraft = normalizedCachedStep === 'action_pending'
    && ['plan_accepted', 'action_pending', 'system_revised'].includes(serverStep)
    && cachedPlan?.status === 'accepted'
    && cache.feedbackDraft?.actionFeedback.planId === cachedPlan.id
  const currentStep = serverStep === 'idle'
    ? uiRecoveryStep(serverStep, drafts?.expressionMode ?? null)
    : canRestoreFeedbackDraft ? 'action_pending' : serverStep
  const legacyUi = ui as Partial<DemoSessionState> | undefined
  const submittedAnswers = cachedUnderstanding?.submittedAnswers ?? legacyUi?.answers ?? {}
  const currentQuestionIndex = cachedUnderstanding?.currentQuestionIndex ?? legacyUi?.currentQuestionIndex ?? 0
  const currentQuestion = cachedUnderstanding?.currentQuestion
    ?? (currentStep === 'asking_question' ? understandingQuestionAt(currentQuestionIndex) : null)
  const serverUnderstanding = cachedUnderstanding?.serverUnderstanding ?? legacyUi?.understanding ?? null
  const cachedCurrentPlan = cachedPlan
  const cachedPlanVersions = plans?.planVersions ?? []
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
    activeThreadId: activeThread?.id ?? null,
    availableThreads,
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
    understandingSource: serverUnderstanding || cachedUnderstanding?.understandingSessionId ? 'cache' : 'none',
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
    planSource: cachedCurrentPlan || cachedPlanVersions.length ? 'cache' : 'none',
    lastSuccessfulPlanAt: plans?.lastSuccessfulPlanAt ?? cachedCurrentPlan?.updatedAt ?? cachedCurrentPlan?.createdAt ?? null,
    lastViewedPlanId: plans?.lastViewedPlanId ?? cachedCurrentPlan?.id ?? null,
    planModificationDraft: {
      ...fallback.planModificationDraft,
      ...cache.planDrafts?.planModificationDraft,
    },
    actionFeedback: restoreFeedbackDraft(
      fallback.actionFeedback,
      cache.feedbackDraft?.actionFeedback ?? legacyUi?.actionFeedback,
    ),
    latestActionResult,
    actionResultId: actions?.actionResultId ?? latestActionResult?.id ?? null,
    actionResultStatus: actions?.actionResultStatus ?? latestActionResult?.resultStatus ?? null,
    actionResultSubmittedAt: actions?.actionResultSubmittedAt ?? latestActionResult?.submittedAt ?? null,
    actionResultRequestStatus: 'idle',
    actionResultApiError: null,
    actionResultSource: latestActionResult ? 'cache' : 'none',
    latestSnapshot,
    previousSnapshot: actions?.previousSnapshot ?? null,
    snapshotDiff: actions?.snapshotDiff ?? null,
    latestActionHypothesis: actions?.latestActionHypothesis ?? null,
    systemRevision: actions?.systemRevision ?? legacyUi?.systemRevision ?? null,
    systemRevisionSource: actions?.systemRevision ? 'cache' : 'none',
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
    correctionSource: latestCorrectionResult ? 'cache' : 'none',
    systemSnapshot: latestSnapshot ?? ui?.systemSnapshot ?? fallback.systemSnapshot,
  }
}

function readLegacyState(userId: string): DemoSessionState | null {
  const parsed = readJson(legacyStorageKey(userId)) as Partial<LegacyIntegrationCache> | null
  const activeThread = parsed?.server?.activeThread
  if (
    !parsed
    || parsed.schemaVersion !== 3
    || parsed.userId !== userId
    || !activeThread
    || activeThread.userId !== userId
    || parsed.lastThreadId !== activeThread.id
    || !Array.isArray(parsed.server?.availableThreads)
    || parsed.server.availableThreads.some((thread) => thread.userId !== userId)
  ) return null
  return restoreCacheState(
    createInitialSession(),
    parsed as LegacyIntegrationCache,
    parsed.server.availableThreads,
  )
}

export function readThreadIntegrationCache(userId: string, threadId: string): DemoSessionState | null {
  const threadCache = readThreadCache(userId, threadId)
  if (!threadCache) return null
  const userCache = readUserCache(userId)
  return restoreCacheState(
    createInitialSession(),
    threadCache,
    userCache?.availableThreads ?? [threadCache.server.activeThread!],
  )
}

export function restoreIntegrationState(): DemoSessionState {
  const fallback = createInitialSession()
  const authSession = readAuthSession()
  if (!authSession) return fallback

  const userCache = readUserCache(authSession.userId)
  if (userCache) {
    const threadId = userCache.lastThreadId
    if (threadId) {
      const restored = readThreadIntegrationCache(authSession.userId, threadId)
      if (restored) return restored
      const activeThread = userCache.availableThreads.find((thread) => thread.id === threadId) ?? null
      if (activeThread) {
        return {
          ...fallback,
          activeThread,
          activeThreadId: activeThread.id,
          availableThreads: userCache.availableThreads,
          serverStep: activeThread.currentStep,
          currentStep: uiRecoveryStep(activeThread.currentStep, null),
          serverSnapshot: userCache.latestSnapshot,
          latestSnapshot: userCache.latestSnapshot,
          snapshotId: userCache.latestSnapshot?.id ?? null,
          snapshotVersion: userCache.latestSnapshot?.version ?? null,
          systemSnapshot: userCache.latestSnapshot ?? fallback.systemSnapshot,
          isOfflineCache: true,
          dataSource: 'cache',
        }
      }
    }
    return {
      ...fallback,
      availableThreads: userCache.availableThreads,
      serverSnapshot: userCache.latestSnapshot,
      latestSnapshot: userCache.latestSnapshot,
      snapshotId: userCache.latestSnapshot?.id ?? null,
      snapshotVersion: userCache.latestSnapshot?.version ?? null,
      systemSnapshot: userCache.latestSnapshot ?? fallback.systemSnapshot,
      isOfflineCache: Boolean(userCache.latestSnapshot),
      dataSource: userCache.latestSnapshot ? 'cache' : 'none',
    }
  }

  const legacy = readLegacyState(authSession.userId)
  if (!legacy) return fallback
  writeIntegrationCache(legacy)
  try {
    window.localStorage.removeItem(legacyStorageKey(authSession.userId))
  } catch {
    // A validated legacy cache remains safe to retry on the next load.
  }
  return legacy
}

export function writeIntegrationCache(state: DemoSessionState) {
  const authSession = readAuthSession()
  if (!authSession) return
  const userId = authSession.userId
  if (
    state.activeThread?.userId && state.activeThread.userId !== userId
    || state.serverSnapshot?.userId && state.serverSnapshot.userId !== userId
  ) return

  const availableThreads = state.availableThreads.filter((thread) => thread.userId === userId)
  const userCache: UserIntegrationCache = {
    schemaVersion: 4,
    userId,
    savedAt: new Date().toISOString(),
    lastThreadId: state.activeThreadId,
    availableThreads,
    latestSnapshot: state.serverSnapshot,
  }
  try {
    window.localStorage.setItem(userStorageKey(userId), JSON.stringify(userCache))
  } catch {
    return
  }

  const thread = state.activeThread
  if (!thread || state.activeThreadId !== thread.id) return
  if (state.isLoading && state.dataSource === 'none') return

  const threadCache: ThreadIntegrationCache = {
    schemaVersion: 4,
    userId,
    threadId: thread.id,
    savedAt: new Date().toISOString(),
    server: {
      serverStep: state.serverStep,
      activeThread: thread,
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
    planDrafts: { planModificationDraft: state.planModificationDraft },
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
    feedbackDraft: { actionFeedback: state.actionFeedback },
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
    window.localStorage.setItem(threadStorageKey(userId, thread.id), JSON.stringify(threadCache))
  } catch {
    // The in-memory state remains usable without thread cache persistence.
  }
}

export function clearIntegrationCache(userId = readAuthSession()?.userId ?? null) {
  if (!userId) return
  try {
    const keys = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
      .filter((key): key is string => Boolean(key))
      .filter((key) => key === userStorageKey(userId)
        || key === legacyStorageKey(userId)
        || key.startsWith(`${THREAD_STORAGE_PREFIX}:${userId}:`))
    keys.forEach((key) => window.localStorage.removeItem(key))
  } catch {
    // The reducer still resets in-memory state when storage is unavailable.
  }
}
