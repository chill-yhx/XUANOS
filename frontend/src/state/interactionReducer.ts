import { understandingQuestions } from '../data/understandingQuestions'
import type {
  ActiveThread,
  ActionSubmissionResult,
  ApiErrorState,
  CorrectionTarget,
  CorrectionType,
  DemoSessionState,
  ExpressionMode,
  FeedbackPayload,
  PlanAcceptResult,
  PlanCreateResult,
  PlanModificationDraft,
  PlanReviseResult,
  PlanVersion,
  RequestScope,
  SystemSnapshot,
  ThreadAggregateState,
  UnderstandingAnalyzeResult,
  UnderstandingAssessment,
  UnderstandingConfirmResult,
  UserCorrectionResult,
} from '../types'
import { createInitialSession, initialFeedback } from './initialState'
import { serverRecoveryStep, uiRecoveryStep } from './threadRecovery'
import { laterInteractionStep } from './workflowSteps'

export type InteractionAction =
  | { type: 'AUTH_SESSION_INVALIDATED'; error: ApiErrorState }
  | { type: 'API_REQUEST_STARTED' }
  | { type: 'API_REQUEST_FAILED'; error: ApiErrorState; scope?: RequestScope }
  | { type: 'API_SYNC_COMPLETED'; scope?: RequestScope }
  | { type: 'THREADS_LOADED'; threads: ActiveThread[] }
  | { type: 'THREAD_CREATED'; thread: ActiveThread; generation: number }
  | { type: 'THREAD_SWITCH_STARTED'; thread: ActiveThread; generation: number }
  | { type: 'THREAD_SWITCH_FAILED'; scope: RequestScope; error: ApiErrorState; cachedState: DemoSessionState | null }
  | { type: 'THREAD_DRAFT_RESTORED'; scope: RequestScope; cachedState: DemoSessionState | null }
  | { type: 'THREAD_AGGREGATE_LOADED'; aggregate: ThreadAggregateState; scope: RequestScope }
  | { type: 'SNAPSHOT_LOADED'; snapshot: SystemSnapshot; scope?: RequestScope }
  | { type: 'START_CALIBRATION' }
  | { type: 'SELECT_EXPRESSION_MODE'; mode: ExpressionMode }
  | { type: 'UPDATE_USER_INPUT'; value: string }
  | { type: 'UPDATE_ANSWER_DRAFT'; value: string }
  | { type: 'UPDATE_UNDERSTANDING_ASSESSMENT'; assessment: UnderstandingAssessment | null }
  | { type: 'UPDATE_UNDERSTANDING_CORRECTION'; value: string }
  | { type: 'UNDERSTANDING_REQUEST_STARTED' }
  | { type: 'UNDERSTANDING_ANALYZE_SUCCEEDED'; result: UnderstandingAnalyzeResult; scope: RequestScope }
  | { type: 'UNDERSTANDING_CONFIRM_SUCCEEDED'; result: UnderstandingConfirmResult; scope: RequestScope }
  | { type: 'UNDERSTANDING_REQUEST_FAILED'; error: ApiErrorState; scope?: RequestScope }
  | { type: 'GO_TO_PREVIOUS_QUESTION' }
  | { type: 'UPDATE_PLAN_MODIFICATION_DRAFT'; value: Partial<PlanModificationDraft> }
  | { type: 'SELECT_PLAN_VERSION'; planId: string }
  | { type: 'PLAN_REQUEST_STARTED' }
  | { type: 'PLAN_CREATE_SUCCEEDED'; result: PlanCreateResult; scope: RequestScope }
  | { type: 'PLAN_REVISE_SUCCEEDED'; result: PlanReviseResult; scope: RequestScope }
  | { type: 'PLAN_ACCEPT_SUCCEEDED'; result: PlanAcceptResult; scope: RequestScope }
  | { type: 'PLAN_REQUEST_FAILED'; error: ApiErrorState; scope?: RequestScope }
  | { type: 'REOPEN_QUESTIONS' }
  | { type: 'START_ACTION' }
  | { type: 'UPDATE_FEEDBACK_DRAFT'; value: Partial<FeedbackPayload> }
  | { type: 'ACTION_RESULT_REQUEST_STARTED' }
  | { type: 'ACTION_RESULT_SUCCEEDED'; result: ActionSubmissionResult; scope: RequestScope }
  | { type: 'ACTION_RESULT_REQUEST_FAILED'; error: ApiErrorState; scope?: RequestScope }
  | { type: 'ACTION_RESULT_READBACK_FAILED'; error: ApiErrorState; scope: RequestScope }
  | { type: 'OPEN_CORRECTION_TARGET'; target: CorrectionTarget }
  | { type: 'CLOSE_CORRECTION_TARGET' }
  | { type: 'UPDATE_CORRECTION_TYPE'; correctionType: CorrectionType | null }
  | { type: 'UPDATE_CORRECTION_DRAFT'; value: string }
  | { type: 'UPDATE_CORRECTION_REASON'; value: string }
  | { type: 'UPDATE_CORRECTION_CONFIRMATION'; confirmed: boolean }
  | { type: 'CORRECTION_REQUEST_STARTED' }
  | { type: 'CORRECTION_REQUEST_SUCCEEDED'; result: UserCorrectionResult; scope: RequestScope }
  | { type: 'CORRECTION_STALE_SNAPSHOT_REFRESHED'; snapshot: SystemSnapshot; error: ApiErrorState; scope: RequestScope }
  | { type: 'CORRECTION_REQUEST_FAILED'; error: ApiErrorState; scope?: RequestScope }
  | { type: 'CORRECTION_READBACK_FAILED'; error: ApiErrorState; scope: RequestScope }
  | { type: 'RESET_DEMO_DATA' }

function withThread(state: DemoSessionState, status: string, phase = state.uiThreadPhase): DemoSessionState {
  return {
    ...state,
    uiThreadStatus: status,
    uiThreadPhase: phase,
  }
}

function mergeThread(threads: ActiveThread[], thread: ActiveThread) {
  return [thread, ...threads.filter((item) => item.id !== thread.id)]
}

function updateThreadStep(
  state: DemoSessionState,
  step: DemoSessionState['serverStep'],
  sessionId = state.understandingSessionId,
  planId = state.activePlanId,
) {
  if (!state.activeThread) return { activeThread: null, availableThreads: state.availableThreads }
  const activeThread = {
    ...state.activeThread,
    currentStep: step,
    activeUnderstandingSessionId: sessionId,
    activePlanId: planId,
  }
  return { activeThread, availableThreads: mergeThread(state.availableThreads, activeThread) }
}

function mergePlans(plans: PlanVersion[], ...updates: PlanVersion[]) {
  const byId = new Map(plans.map((plan) => [plan.id, plan]))
  updates.forEach((plan) => byId.set(plan.id, plan))
  return [...byId.values()].sort((left, right) => left.version - right.version)
}

function requestScopeMatches(state: DemoSessionState, scope: RequestScope) {
  const currentUserId = state.activeThread?.userId ?? state.serverSnapshot?.userId ?? null
  return state.activeThreadGeneration === scope.generation
    && state.activeThreadId === scope.threadId
    && (!currentUserId || currentUserId === scope.userId)
}

function resetThreadScopedState(
  state: DemoSessionState,
  thread: ActiveThread,
  generation: number,
): DemoSessionState {
  const reset = createInitialSession()
  return {
    ...reset,
    activeThreadGeneration: generation,
    activeThread: thread,
    activeThreadId: thread.id,
    availableThreads: mergeThread(state.availableThreads, thread),
    serverStep: thread.currentStep,
    currentStep: uiRecoveryStep(thread.currentStep, null),
    uiThreadStatus: thread.status,
    uiThreadPhase: thread.phase,
    isLoading: true,
    dataSource: 'none',
  }
}

function restoreThreadDrafts(state: DemoSessionState, cached: DemoSessionState | null): DemoSessionState {
  if (!cached || cached.activeThreadId !== state.activeThreadId) return state

  const hasServerSession = Boolean(state.activeUnderstandingSession)
  const sameQuestion = Boolean(
    state.currentQuestion
    && cached.currentQuestion?.id === state.currentQuestion.id
    && cached.understandingSessionId === state.understandingSessionId,
  )
  const samePlan = Boolean(state.activePlanId && cached.activePlanId === state.activePlanId)
  const sameSnapshot = Boolean(
    state.latestSnapshot?.id
    && cached.latestSnapshot?.id === state.latestSnapshot.id
    && cached.latestSnapshot.version === state.latestSnapshot.version,
  )
  const correctionIsCurrent = Boolean(
    sameSnapshot
    && cached.activeCorrectionTarget?.snapshotId === state.latestSnapshot?.id
    && cached.activeCorrectionTarget?.snapshotVersion === state.latestSnapshot?.version,
  )
  const comparisonIsCurrent = Boolean(
    sameSnapshot
    && cached.snapshotDiff?.toSnapshotId === state.latestSnapshot?.id,
  )
  const expressionMode = hasServerSession
    ? state.expressionMode
    : cached.expressionMode

  return {
    ...state,
    currentStep: state.serverStep === 'idle'
      ? uiRecoveryStep(state.serverStep, expressionMode)
      : state.currentStep,
    expressionMode,
    userInput: hasServerSession ? state.userInput : cached.userInput,
    currentAnswerDraft: sameQuestion ? cached.currentAnswerDraft : '',
    understandingAssessmentDraft: state.currentStep === 'reviewing_understanding'
      ? cached.understandingAssessmentDraft
      : null,
    understandingCorrectionDraft: state.currentStep === 'reviewing_understanding'
      ? cached.understandingCorrectionDraft
      : '',
    planModificationDraft: samePlan
      ? cached.planModificationDraft
      : { reason: null, userChoice: '', expectedImpactAcknowledged: false },
    actionFeedback: samePlan && cached.actionFeedback.planId === state.activePlanId
      ? cached.actionFeedback
      : { ...initialFeedback },
    previousSnapshot: comparisonIsCurrent ? cached.previousSnapshot : null,
    snapshotDiff: comparisonIsCurrent ? cached.snapshotDiff : null,
    activeCorrectionTarget: correctionIsCurrent ? cached.activeCorrectionTarget : null,
    correctionType: correctionIsCurrent ? cached.correctionType : null,
    correctionDraft: correctionIsCurrent ? cached.correctionDraft : '',
    correctionReason: correctionIsCurrent ? cached.correctionReason : '',
    correctionDiscontinueConfirmed: correctionIsCurrent
      ? cached.correctionDiscontinueConfirmed
      : false,
    latestCorrectionId: sameSnapshot ? cached.latestCorrectionId : state.latestCorrectionId,
    latestCorrectionAt: sameSnapshot ? cached.latestCorrectionAt : state.latestCorrectionAt,
    latestCorrectionResult: sameSnapshot ? cached.latestCorrectionResult : state.latestCorrectionResult,
    correctionSource: sameSnapshot && cached.latestCorrectionResult ? 'cache' : state.correctionSource,
  }
}

export function interactionReducer(state: DemoSessionState, action: InteractionAction): DemoSessionState {
  const scope = 'scope' in action ? action.scope : undefined
  if (scope && !requestScopeMatches(state, scope)) return state

  switch (action.type) {
    case 'AUTH_SESSION_INVALIDATED':
      return {
        ...createInitialSession(),
        isLoading: false,
        apiError: action.error,
      }

    case 'API_REQUEST_STARTED':
      return { ...state, isLoading: true, apiError: null }

    case 'API_REQUEST_FAILED':
      return {
        ...state,
        isLoading: false,
        apiError: action.error,
        isOfflineCache: Boolean(state.serverSnapshot || state.activeThread),
        dataSource: state.serverSnapshot || state.activeThread ? 'cache' : state.dataSource,
        understandingSource: state.serverUnderstanding ? 'cache' : state.understandingSource,
        planSource: state.currentPlan ? 'cache' : state.planSource,
        actionResultSource: state.latestActionResult ? 'cache' : state.actionResultSource,
        systemRevisionSource: state.systemRevision ? 'cache' : state.systemRevisionSource,
        correctionSource: state.latestCorrectionResult ? 'cache' : state.correctionSource,
      }

    case 'API_SYNC_COMPLETED':
      return { ...state, isLoading: false, apiError: null, isOfflineCache: false, dataSource: 'api' }

    case 'THREADS_LOADED':
      {
        const activeThread = action.threads.find((thread) => thread.id === state.activeThreadId) ?? null
        if (state.activeThreadId && !activeThread) {
          return {
            ...createInitialSession(),
            activeThreadGeneration: state.activeThreadGeneration,
            availableThreads: action.threads,
            apiError: null,
            dataSource: 'api',
          }
        }
        return {
          ...state,
          activeThread: activeThread ?? state.activeThread,
          activeThreadId: activeThread?.id ?? state.activeThreadId,
          availableThreads: action.threads,
          apiError: null,
          dataSource: 'api',
        }
      }

    case 'THREAD_SWITCH_STARTED':
      return resetThreadScopedState(state, action.thread, action.generation)

    case 'THREAD_SWITCH_FAILED': {
      if (!action.cachedState) {
        return {
          ...state,
          isLoading: false,
          apiError: action.error,
          isOfflineCache: false,
          dataSource: 'none',
        }
      }
      return {
        ...action.cachedState,
        activeThreadGeneration: action.scope.generation,
        activeThread: state.activeThread,
        activeThreadId: state.activeThreadId,
        availableThreads: state.availableThreads,
        isLoading: false,
        apiError: action.error,
        isOfflineCache: true,
        dataSource: 'cache',
        understandingSource: action.cachedState.serverUnderstanding ? 'cache' : 'none',
        planSource: action.cachedState.currentPlan ? 'cache' : 'none',
        actionResultSource: action.cachedState.latestActionResult ? 'cache' : 'none',
        systemRevisionSource: action.cachedState.systemRevision ? 'cache' : 'none',
        correctionSource: action.cachedState.latestCorrectionResult ? 'cache' : 'none',
      }
    }

    case 'THREAD_DRAFT_RESTORED':
      return restoreThreadDrafts(state, action.cachedState)

    case 'THREAD_CREATED': {
      const reset = resetThreadScopedState(state, action.thread, action.generation)
      return {
        ...reset,
        serverStep: action.thread.currentStep,
        currentStep: 'expression_mode',
        uiThreadStatus: action.thread.status,
        uiThreadPhase: '选择表达方式',
        activeUnderstandingSession: null,
        understandingSessionId: null,
        understandingStatus: 'idle',
        understandingConfirmedAt: null,
        serverUnderstanding: null,
        understandingRequestStatus: 'idle',
        understandingApiError: null,
        understandingSource: 'api',
        lastSuccessfulUnderstandingAt: null,
        expressionMode: null,
        userInput: '',
        currentAnswerDraft: '',
        understandingAssessmentDraft: null,
        understandingCorrectionDraft: '',
        answers: {},
        submittedAnswers: {},
        answerMeta: {},
        currentQuestionIndex: 0,
        currentQuestion: null,
        understanding: null,
        corrections: [],
        currentPlan: null,
        planVersions: [],
        activePlanId: null,
        planRequestStatus: 'idle',
        planApiError: null,
        planSource: 'none',
        lastSuccessfulPlanAt: null,
        lastViewedPlanId: null,
        planModificationDraft: {
          reason: null,
          userChoice: '',
          expectedImpactAcknowledged: false,
        },
        actionFeedback: { ...initialFeedback },
        latestActionResult: null,
        actionResultId: null,
        actionResultStatus: null,
        actionResultSubmittedAt: null,
        actionResultRequestStatus: 'idle',
        actionResultApiError: null,
        actionResultSource: 'none',
        latestSnapshot: null,
        previousSnapshot: null,
        snapshotDiff: null,
        latestActionHypothesis: null,
        systemRevision: null,
        systemRevisionSource: 'none',
        systemRevisionAt: null,
        activeCorrectionTarget: null,
        correctionType: null,
        correctionDraft: '',
        correctionReason: '',
        correctionDiscontinueConfirmed: false,
        correctionRequestStatus: 'idle',
        correctionApiError: null,
        latestCorrectionId: null,
        latestCorrectionAt: null,
        latestCorrectionResult: null,
        correctionSource: 'none',
        isLoading: false,
        apiError: null,
        isOfflineCache: false,
        dataSource: 'api',
      }
    }

    case 'THREAD_AGGREGATE_LOADED': {
      const aggregate = action.aggregate
      if (
        aggregate.thread.id !== action.scope.threadId
        || aggregate.thread.userId !== action.scope.userId
      ) return state
      const sameThread = state.activeThreadId === aggregate.thread.id
      const hasLiveServerState = sameThread && state.dataSource === 'api' && !state.isOfflineCache
      const aggregateStep = serverRecoveryStep(aggregate)
      const serverStep = hasLiveServerState
        ? laterInteractionStep(state.serverStep, aggregateStep)
        : aggregateStep
      const thread = serverStep === aggregate.thread.currentStep
        ? aggregate.thread
        : { ...aggregate.thread, currentStep: serverStep }
      const activeSession = aggregate.activeUnderstandingSession
      const preserveAnswerDraft = sameThread
        && state.understandingSessionId === activeSession?.id
        && state.currentQuestion?.id === aggregate.currentQuestion?.id
      const sameActionResult = Boolean(
        sameThread
        && aggregate.latestActionResult
        && aggregate.latestActionResult.id === state.latestActionResult?.id,
      )
      const latestActionResult = sameActionResult
        && aggregate.latestActionResult
        && state.latestActionResult
        ? {
            ...aggregate.latestActionResult,
            resultStatus: state.latestActionResult.resultStatus,
            planItemId: state.latestActionResult.planItemId,
            actionIdentifier: state.latestActionResult.actionIdentifier,
          }
        : aggregate.latestActionResult
      const preserveFeedbackDraft = Boolean(
        sameThread
        && aggregate.currentPlan?.status === 'accepted'
        && state.actionFeedback.planId === aggregate.currentPlan.id,
      )
      const sameCorrectionSnapshot = Boolean(
        sameThread
        && state.latestCorrectionResult
        && state.latestCorrectionResult.snapshot.id === aggregate.snapshot.id
        && state.latestCorrectionResult.snapshot.version === aggregate.snapshot.version,
      )
      const preserveSnapshotComparison = sameActionResult || sameCorrectionSnapshot
      const preservePlanDraft = Boolean(
        sameThread
        && aggregate.currentPlan
        && state.activePlanId === aggregate.currentPlan.id,
      )
      const currentStep = preserveFeedbackDraft && state.currentStep === 'action_pending'
        ? 'action_pending'
        : uiRecoveryStep(serverStep, aggregate.expressionMode ?? state.expressionMode)
      return {
        ...state,
        activeThread: thread,
        activeThreadId: thread.id,
        availableThreads: mergeThread(state.availableThreads, thread),
        serverStep,
        currentStep,
        uiThreadStatus: aggregate.thread.status,
        uiThreadPhase: aggregate.thread.phase,
        activeUnderstandingSession: activeSession,
        understandingSessionId: activeSession?.id ?? null,
        understandingStatus: activeSession?.status ?? 'idle',
        understandingConfirmedAt: activeSession?.confirmedAt ?? null,
        serverUnderstanding: aggregate.understanding,
        understandingRequestStatus: activeSession ? 'success' : 'idle',
        understandingApiError: null,
        understandingSource: activeSession || aggregate.understanding ? 'api' : 'none',
        lastSuccessfulUnderstandingAt: activeSession?.updatedAt ?? null,
        expressionMode: aggregate.expressionMode ?? (sameThread ? state.expressionMode : null),
        userInput: activeSession ? aggregate.userInput : sameThread ? state.userInput : '',
        currentAnswerDraft: preserveAnswerDraft ? state.currentAnswerDraft : '',
        understandingAssessmentDraft: currentStep === 'reviewing_understanding' && sameThread
          ? state.understandingAssessmentDraft
          : null,
        understandingCorrectionDraft: currentStep === 'reviewing_understanding' && sameThread
          ? state.understandingCorrectionDraft
          : '',
        answers: aggregate.answers,
        submittedAnswers: aggregate.answers,
        answerMeta: aggregate.answerMeta,
        currentQuestionIndex: aggregate.currentQuestionIndex,
        currentQuestion: aggregate.currentQuestion,
        understanding: aggregate.understanding,
        corrections: aggregate.corrections,
        currentPlan: aggregate.currentPlan,
        planVersions: aggregate.planVersions,
        activePlanId: thread.activePlanId,
        planRequestStatus: aggregate.currentPlan ? 'success' : 'idle',
        planApiError: null,
        planSource: aggregate.currentPlan ? 'api' : 'none',
        lastSuccessfulPlanAt: aggregate.currentPlan
          ? aggregate.currentPlan.updatedAt ?? aggregate.currentPlan.createdAt
          : null,
        lastViewedPlanId: aggregate.currentPlan
          ? sameThread && aggregate.planVersions.some((plan) => plan.id === state.lastViewedPlanId)
            ? state.lastViewedPlanId
            : aggregate.currentPlan.id
          : null,
        planModificationDraft: preservePlanDraft
          ? state.planModificationDraft
          : { reason: null, userChoice: '', expectedImpactAcknowledged: false },
        actionFeedback: preserveFeedbackDraft ? state.actionFeedback : { ...initialFeedback },
        latestActionResult,
        systemRevision: aggregate.systemRevision,
        actionResultId: latestActionResult?.id ?? null,
        actionResultStatus: latestActionResult?.resultStatus ?? null,
        actionResultSubmittedAt: latestActionResult?.submittedAt ?? null,
        actionResultRequestStatus: latestActionResult ? 'success' : 'idle',
        actionResultApiError: null,
        actionResultSource: latestActionResult ? 'api' : 'none',
        latestSnapshot: aggregate.snapshot,
        previousSnapshot: preserveSnapshotComparison ? state.previousSnapshot : null,
        snapshotDiff: preserveSnapshotComparison ? state.snapshotDiff : null,
        latestActionHypothesis: sameActionResult ? state.latestActionHypothesis : null,
        systemRevisionSource: aggregate.systemRevision ? 'api' : 'none',
        systemRevisionAt: latestActionResult?.submittedAt ?? null,
        activeCorrectionTarget: sameCorrectionSnapshot ? state.activeCorrectionTarget : null,
        correctionType: sameCorrectionSnapshot ? state.correctionType : null,
        correctionDraft: sameCorrectionSnapshot ? state.correctionDraft : '',
        correctionReason: sameCorrectionSnapshot ? state.correctionReason : '',
        correctionDiscontinueConfirmed: sameCorrectionSnapshot
          ? state.correctionDiscontinueConfirmed
          : false,
        correctionRequestStatus: sameCorrectionSnapshot ? 'success' : 'idle',
        correctionApiError: null,
        latestCorrectionId: sameCorrectionSnapshot ? state.latestCorrectionId : null,
        latestCorrectionAt: sameCorrectionSnapshot ? state.latestCorrectionAt : null,
        latestCorrectionResult: sameCorrectionSnapshot ? state.latestCorrectionResult : null,
        correctionSource: sameCorrectionSnapshot ? 'api' : 'none',
        serverSnapshot: aggregate.snapshot,
        snapshotId: aggregate.snapshot.id,
        snapshotVersion: aggregate.snapshot.version,
        systemSnapshot: aggregate.snapshot,
        apiError: null,
        isOfflineCache: false,
        dataSource: 'api',
      }
    }

    case 'SNAPSHOT_LOADED':
      if (action.snapshot.userId && state.activeThread?.userId
        && action.snapshot.userId !== state.activeThread.userId) return state
      if (state.serverSnapshot && action.snapshot.version < state.serverSnapshot.version) return state
      {
        const comparisonIsCurrent = state.snapshotDiff?.toSnapshotId === action.snapshot.id
        return {
          ...state,
          serverSnapshot: action.snapshot,
          snapshotId: action.snapshot.id,
          snapshotVersion: action.snapshot.version,
          latestSnapshot: action.snapshot,
          previousSnapshot: comparisonIsCurrent ? state.previousSnapshot : null,
          snapshotDiff: comparisonIsCurrent ? state.snapshotDiff : null,
          systemSnapshot: action.snapshot,
          correctionRequestStatus: state.activeCorrectionTarget ? 'idle' : state.correctionRequestStatus,
          correctionApiError: null,
          apiError: null,
          isOfflineCache: false,
          dataSource: 'api',
        }
      }

    case 'START_CALIBRATION':
      if (!state.activeThreadId) return state
      return withThread({ ...state, currentStep: 'expression_mode' }, '正在理解', '选择表达方式')

    case 'SELECT_EXPRESSION_MODE':
      return withThread(
        {
          ...state,
          expressionMode: action.mode,
          currentStep: action.mode === 'ask' ? 'expression_mode' : 'collecting_input',
          understandingApiError: null,
          understandingRequestStatus: 'idle',
          currentAnswerDraft: '',
          understandingAssessmentDraft: null,
          understandingCorrectionDraft: '',
        },
        '正在理解',
        action.mode === 'ask' ? '准备提问' : '收集表达',
      )

    case 'UPDATE_USER_INPUT':
      return { ...state, userInput: action.value }

    case 'UPDATE_ANSWER_DRAFT':
      return { ...state, currentAnswerDraft: action.value }

    case 'UPDATE_UNDERSTANDING_ASSESSMENT':
      return {
        ...state,
        understandingAssessmentDraft: action.assessment,
        understandingCorrectionDraft: action.assessment ? state.understandingCorrectionDraft : '',
      }

    case 'UPDATE_UNDERSTANDING_CORRECTION':
      return { ...state, understandingCorrectionDraft: action.value }

    case 'UNDERSTANDING_REQUEST_STARTED':
      return {
        ...state,
        understandingRequestStatus: 'loading',
        understandingApiError: null,
      }

    case 'UNDERSTANDING_ANALYZE_SUCCEEDED': {
      const { result } = action
      const sameSession = state.understandingSessionId === result.session.id
      const serverUnderstanding = result.understanding
        ?? (sameSession ? state.serverUnderstanding : null)
      const threadState = updateThreadStep(state, result.currentStep, result.session.id)
      return withThread(
        {
          ...state,
          ...threadState,
          currentStep: result.currentStep,
          serverStep: result.currentStep,
          activeUnderstandingSession: result.session,
          understandingSessionId: result.session.id,
          understandingStatus: result.session.status,
          understandingConfirmedAt: result.session.confirmedAt,
          serverUnderstanding,
          understandingRequestStatus: 'success',
          understandingApiError: null,
          understandingSource: 'api',
          lastSuccessfulUnderstandingAt: result.session.updatedAt,
          expressionMode: result.session.expressionMode,
          userInput: result.session.userInput ?? state.userInput,
          currentAnswerDraft: result.nextQuestion
            ? result.submittedAnswers[result.nextQuestion.id] ?? ''
            : '',
          answers: result.submittedAnswers,
          submittedAnswers: result.submittedAnswers,
          answerMeta: result.answerMeta,
          currentQuestionIndex: result.nextQuestion?.index ?? result.session.currentQuestionIndex,
          currentQuestion: result.nextQuestion,
          understanding: serverUnderstanding,
          isOfflineCache: false,
          dataSource: 'api',
          apiError: null,
        },
        '正在理解',
        result.currentStep === 'reviewing_understanding' ? '理解确认' : '核对现实',
      )
    }

    case 'UNDERSTANDING_CONFIRM_SUCCEEDED': {
      const { result } = action
      const corrections = result.correction
        ? [...state.corrections.filter((item) => item.id !== result.correction?.id), result.correction]
        : state.corrections
      const threadState = updateThreadStep(state, result.currentStep, result.session.id)
      return withThread(
        {
          ...state,
          ...threadState,
          currentStep: result.currentStep,
          serverStep: result.currentStep,
          activeUnderstandingSession: result.session,
          understandingSessionId: result.session.id,
          understandingStatus: result.session.status,
          understandingConfirmedAt: result.session.confirmedAt,
          serverUnderstanding: result.understanding,
          understanding: result.understanding,
          corrections,
          currentQuestion: null,
          currentAnswerDraft: '',
          understandingAssessmentDraft: null,
          understandingCorrectionDraft: '',
          understandingRequestStatus: 'success',
          understandingApiError: null,
          understandingSource: 'api',
          lastSuccessfulUnderstandingAt: result.session.updatedAt,
          serverSnapshot: result.snapshot ?? state.serverSnapshot,
          snapshotId: result.snapshot?.id ?? state.snapshotId,
          snapshotVersion: result.snapshot?.version ?? state.snapshotVersion,
          systemSnapshot: result.snapshot ?? state.systemSnapshot,
          latestSnapshot: result.snapshot ?? state.latestSnapshot,
          isOfflineCache: false,
          dataSource: 'api',
          apiError: null,
        },
        result.currentStep === 'understanding_confirmed' ? '理解已确认' : '正在理解',
        result.currentStep === 'understanding_confirmed' ? '起点档案' : '理解确认',
      )
    }

    case 'UNDERSTANDING_REQUEST_FAILED': {
      const offline = ['NETWORK_ERROR', 'TIMEOUT'].includes(action.error.code)
      return {
        ...state,
        understandingRequestStatus: 'error',
        understandingApiError: action.error,
        understandingSource: offline && state.serverUnderstanding ? 'cache' : state.understandingSource,
        isOfflineCache: offline && Boolean(state.serverUnderstanding || state.activeThread),
      }
    }

    case 'GO_TO_PREVIOUS_QUESTION':
      {
        const currentQuestionIndex = Math.max(0, state.currentQuestionIndex - 1)
        const currentQuestion = understandingQuestions[currentQuestionIndex] ?? null
        return {
          ...state,
          currentQuestionIndex,
          currentQuestion,
          currentAnswerDraft: currentQuestion ? state.submittedAnswers[currentQuestion.id] ?? '' : '',
          currentStep: 'asking_question',
          understandingApiError: null,
          understandingRequestStatus: 'idle',
        }
      }

    case 'UPDATE_PLAN_MODIFICATION_DRAFT':
      return {
        ...state,
        planModificationDraft: { ...state.planModificationDraft, ...action.value },
      }

    case 'SELECT_PLAN_VERSION':
      if (!state.planVersions.some((plan) => plan.id === action.planId)) return state
      return { ...state, lastViewedPlanId: action.planId }

    case 'PLAN_REQUEST_STARTED':
      return { ...state, planRequestStatus: 'loading', planApiError: null }

    case 'PLAN_CREATE_SUCCEEDED': {
      const { plan, currentStep } = action.result
      const threadState = updateThreadStep(state, currentStep, state.understandingSessionId, plan.id)
      return withThread(
        {
          ...state,
          ...threadState,
          currentStep,
          serverStep: currentStep,
          currentPlan: plan,
          planVersions: mergePlans(state.planVersions, plan),
          activePlanId: plan.id,
          planRequestStatus: 'success',
          planApiError: null,
          planSource: 'api',
          lastSuccessfulPlanAt: plan.updatedAt ?? plan.createdAt,
          lastViewedPlanId: plan.id,
          isOfflineCache: false,
          dataSource: 'api',
          apiError: null,
        },
        '等待计划确认',
        '计划裁决',
      )
    }

    case 'PLAN_REVISE_SUCCEEDED': {
      const { previousPlan, currentPlan, currentStep } = action.result
      const threadState = updateThreadStep(state, currentStep, state.understandingSessionId, currentPlan.id)
      return withThread(
        {
          ...state,
          ...threadState,
          currentStep,
          serverStep: currentStep,
          currentPlan,
          planVersions: mergePlans(state.planVersions, previousPlan, currentPlan),
          activePlanId: currentPlan.id,
          planRequestStatus: 'success',
          planApiError: null,
          planSource: 'api',
          lastSuccessfulPlanAt: currentPlan.updatedAt ?? currentPlan.createdAt,
          lastViewedPlanId: currentPlan.id,
          planModificationDraft: {
            reason: null,
            userChoice: '',
            expectedImpactAcknowledged: false,
          },
          isOfflineCache: false,
          dataSource: 'api',
          apiError: null,
        },
        '计划已修改',
        '等待接受',
      )
    }

    case 'PLAN_ACCEPT_SUCCEEDED': {
      const { plan, snapshot, currentStep } = action.result
      const serverStep = laterInteractionStep(state.serverStep, currentStep)
      const uiStep = laterInteractionStep(state.currentStep, serverStep)
      const latestSnapshot = state.latestSnapshot && state.latestSnapshot.version >= snapshot.version
        ? state.latestSnapshot
        : snapshot
      const threadState = updateThreadStep(state, serverStep, state.understandingSessionId, plan.id)
      return withThread(
        {
          ...state,
          ...threadState,
          currentStep: uiStep,
          serverStep,
          currentPlan: plan,
          planVersions: mergePlans(state.planVersions, plan),
          activePlanId: plan.id,
          planRequestStatus: 'success',
          planApiError: null,
          planSource: 'api',
          lastSuccessfulPlanAt: plan.updatedAt ?? plan.createdAt,
          lastViewedPlanId: plan.id,
          serverSnapshot: latestSnapshot,
          snapshotId: latestSnapshot.id,
          snapshotVersion: latestSnapshot.version,
          systemSnapshot: latestSnapshot,
          latestSnapshot,
          isOfflineCache: false,
          dataSource: 'api',
          apiError: null,
        },
        '计划已接受',
        plan.stage,
      )
    }

    case 'PLAN_REQUEST_FAILED': {
      const offline = ['NETWORK_ERROR', 'TIMEOUT'].includes(action.error.code)
      return {
        ...state,
        planRequestStatus: 'error',
        planApiError: action.error,
        planSource: offline && state.currentPlan ? 'cache' : state.planSource,
        isOfflineCache: offline && Boolean(state.currentPlan || state.activeThread),
      }
    }

    case 'REOPEN_QUESTIONS':
      return withThread(
        {
          ...state,
          currentStep: 'expression_mode',
          activeUnderstandingSession: null,
          understandingSessionId: null,
          understandingStatus: 'idle',
          understandingConfirmedAt: null,
          serverUnderstanding: null,
          understandingRequestStatus: 'idle',
          understandingApiError: null,
          understandingSource: 'api',
          expressionMode: null,
          userInput: '',
          currentAnswerDraft: '',
          understandingAssessmentDraft: null,
          understandingCorrectionDraft: '',
          answers: {},
          submittedAnswers: {},
          answerMeta: {},
          currentQuestionIndex: 0,
          currentQuestion: null,
          understanding: null,
        },
        '正在重新核对',
        '选择表达方式',
      )

    case 'START_ACTION':
      if (
        state.currentPlan?.status !== 'accepted'
        || !['plan_accepted', 'action_pending', 'system_revised'].includes(state.serverStep)
        || state.planSource !== 'api'
        || state.isOfflineCache
      ) return state
      {
        const actionItem = state.currentPlan.items?.find((item) => item.itemType === 'action')
        return withThread(
          {
            ...state,
            currentStep: 'action_pending',
            actionFeedback: {
              ...initialFeedback,
              planId: state.currentPlan.id,
              planItemId: actionItem?.id ?? null,
              actionIdentifier: actionItem?.id ?? state.currentPlan.singleAction,
            },
            actionResultRequestStatus: 'idle',
            actionResultApiError: null,
          },
          '等待行动反馈',
          state.currentPlan.stage,
        )
      }

    case 'UPDATE_FEEDBACK_DRAFT':
      return { ...state, actionFeedback: { ...state.actionFeedback, ...action.value } }

    case 'ACTION_RESULT_REQUEST_STARTED':
      return {
        ...state,
        currentStep: 'feedback_submitted',
        actionResultRequestStatus: 'loading',
        actionResultApiError: null,
      }

    case 'ACTION_RESULT_SUCCEEDED': {
      const { result } = action
      const snapshot = result.snapshot
      const threadState = updateThreadStep(state, result.currentStep)
      const activeThread = threadState.activeThread
        ? {
            ...threadState.activeThread,
            status: 'active',
            phase: snapshot.currentStage,
          }
        : null
      return withThread(
        {
          ...state,
          ...threadState,
          activeThread,
          availableThreads: activeThread
            ? mergeThread(threadState.availableThreads, activeThread)
            : threadState.availableThreads,
          currentStep: result.currentStep,
          serverStep: result.currentStep,
          latestActionResult: result.actionResult,
          actionResultId: result.actionResult.id,
          actionResultStatus: result.actionResult.resultStatus,
          actionResultSubmittedAt: result.actionResult.submittedAt,
          actionResultRequestStatus: 'success',
          actionResultApiError: null,
          actionResultSource: 'api',
          actionFeedback: {
            ...initialFeedback,
            planId: result.actionResult.planId,
            planItemId: result.actionResult.planItemId,
            actionIdentifier: result.actionResult.actionIdentifier,
          },
          previousSnapshot: result.previousSnapshot,
          latestSnapshot: snapshot,
          snapshotDiff: result.snapshotDiff,
          latestActionHypothesis: result.hypothesis,
          serverSnapshot: snapshot,
          snapshotId: snapshot.id,
          snapshotVersion: snapshot.version,
          systemSnapshot: snapshot,
          systemRevision: result.systemRevision,
          systemRevisionSource: 'api',
          systemRevisionAt: result.actionResult.submittedAt,
          isOfflineCache: false,
          dataSource: 'api',
          apiError: null,
        },
        '系统已修正',
        snapshot.currentStage,
      )
    }

    case 'ACTION_RESULT_REQUEST_FAILED': {
      const offline = ['NETWORK_ERROR', 'TIMEOUT'].includes(action.error.code)
      return {
        ...state,
        currentStep: 'action_pending',
        actionResultRequestStatus: 'error',
        actionResultApiError: action.error,
        actionResultSource: offline && state.latestActionResult ? 'cache' : state.actionResultSource,
        systemRevisionSource: offline && state.systemRevision ? 'cache' : state.systemRevisionSource,
        isOfflineCache: offline && Boolean(state.activeThread || state.latestSnapshot),
      }
    }

    case 'ACTION_RESULT_READBACK_FAILED':
      return {
        ...state,
        actionResultRequestStatus: 'success',
        actionResultApiError: action.error,
      }

    case 'OPEN_CORRECTION_TARGET': {
      const resumesStaleDraft = Boolean(
        state.correctionApiError?.code === 'STALE_SNAPSHOT'
        && state.activeCorrectionTarget?.key === action.target.key,
      )
      return {
        ...state,
        activeCorrectionTarget: action.target,
        correctionType: resumesStaleDraft ? state.correctionType : null,
        correctionDraft: resumesStaleDraft ? state.correctionDraft : '',
        correctionReason: resumesStaleDraft ? state.correctionReason : '',
        correctionDiscontinueConfirmed: resumesStaleDraft
          ? state.correctionDiscontinueConfirmed
          : false,
        correctionRequestStatus: 'idle',
        correctionApiError: null,
      }
    }

    case 'CLOSE_CORRECTION_TARGET':
      if (state.correctionRequestStatus === 'loading') return state
      return {
        ...state,
        activeCorrectionTarget: null,
        correctionType: null,
        correctionDraft: '',
        correctionReason: '',
        correctionDiscontinueConfirmed: false,
        correctionApiError: null,
      }

    case 'UPDATE_CORRECTION_TYPE':
      return {
        ...state,
        correctionType: action.correctionType,
        correctionDraft: action.correctionType === 'accurate' ? '' : state.correctionDraft,
        correctionDiscontinueConfirmed: false,
        correctionApiError: null,
      }

    case 'UPDATE_CORRECTION_DRAFT':
      return { ...state, correctionDraft: action.value }

    case 'UPDATE_CORRECTION_REASON':
      return { ...state, correctionReason: action.value }

    case 'UPDATE_CORRECTION_CONFIRMATION':
      return { ...state, correctionDiscontinueConfirmed: action.confirmed }

    case 'CORRECTION_REQUEST_STARTED':
      return {
        ...state,
        correctionRequestStatus: 'loading',
        correctionApiError: null,
      }

    case 'CORRECTION_REQUEST_SUCCEEDED': {
      const { result } = action
      const correction = result.correction
      return {
        ...state,
        activeCorrectionTarget: null,
        correctionType: null,
        correctionDraft: '',
        correctionReason: '',
        correctionDiscontinueConfirmed: false,
        correctionRequestStatus: 'success',
        correctionApiError: null,
        latestCorrectionId: correction.id,
        latestCorrectionAt: correction.createdAt,
        latestCorrectionResult: result,
        correctionSource: 'api',
        corrections: [...state.corrections.filter((item) => item.id !== correction.id), correction],
        previousSnapshot: result.previousSnapshot,
        latestSnapshot: result.snapshot,
        snapshotDiff: result.snapshotDiff,
        serverSnapshot: result.snapshot,
        snapshotId: result.snapshot.id,
        snapshotVersion: result.snapshot.version,
        systemSnapshot: result.snapshot,
        apiError: null,
        isOfflineCache: false,
        dataSource: 'api',
      }
    }

    case 'CORRECTION_STALE_SNAPSHOT_REFRESHED': {
      const snapshot = state.serverSnapshot && state.serverSnapshot.version > action.snapshot.version
        ? state.serverSnapshot
        : action.snapshot
      return {
        ...state,
        correctionRequestStatus: 'error',
        correctionApiError: action.error,
        serverSnapshot: snapshot,
        latestSnapshot: snapshot,
        snapshotId: snapshot.id,
        snapshotVersion: snapshot.version,
        systemSnapshot: snapshot,
        previousSnapshot: null,
        snapshotDiff: null,
        isOfflineCache: false,
        dataSource: 'api',
      }
    }

    case 'CORRECTION_REQUEST_FAILED': {
      const offline = ['NETWORK_ERROR', 'TIMEOUT'].includes(action.error.code)
      return {
        ...state,
        correctionRequestStatus: 'error',
        correctionApiError: action.error,
        correctionSource: offline && state.latestCorrectionResult ? 'cache' : state.correctionSource,
        isOfflineCache: offline && Boolean(state.serverSnapshot || state.activeThread),
      }
    }

    case 'CORRECTION_READBACK_FAILED':
      return { ...state, apiError: action.error }

    case 'RESET_DEMO_DATA':
      return createInitialSession()

    default:
      return state
  }
}
