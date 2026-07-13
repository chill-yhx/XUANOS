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
  SystemSnapshot,
  ThreadAggregateState,
  UnderstandingAnalyzeResult,
  UnderstandingAssessment,
  UnderstandingConfirmResult,
  UserCorrectionResult,
} from '../types'
import { createInitialSession, initialFeedback } from './initialState'

export type InteractionAction =
  | { type: 'API_REQUEST_STARTED' }
  | { type: 'API_REQUEST_FAILED'; error: ApiErrorState }
  | { type: 'API_SYNC_COMPLETED' }
  | { type: 'THREADS_LOADED'; threads: ActiveThread[] }
  | { type: 'THREAD_CREATED'; thread: ActiveThread }
  | { type: 'THREAD_AGGREGATE_LOADED'; aggregate: ThreadAggregateState }
  | { type: 'SNAPSHOT_LOADED'; snapshot: SystemSnapshot }
  | { type: 'START_CALIBRATION' }
  | { type: 'SELECT_EXPRESSION_MODE'; mode: ExpressionMode }
  | { type: 'UPDATE_USER_INPUT'; value: string }
  | { type: 'UPDATE_ANSWER_DRAFT'; value: string }
  | { type: 'UPDATE_UNDERSTANDING_ASSESSMENT'; assessment: UnderstandingAssessment | null }
  | { type: 'UPDATE_UNDERSTANDING_CORRECTION'; value: string }
  | { type: 'UNDERSTANDING_REQUEST_STARTED' }
  | { type: 'UNDERSTANDING_ANALYZE_SUCCEEDED'; result: UnderstandingAnalyzeResult }
  | { type: 'UNDERSTANDING_CONFIRM_SUCCEEDED'; result: UnderstandingConfirmResult }
  | { type: 'UNDERSTANDING_REQUEST_FAILED'; error: ApiErrorState }
  | { type: 'GO_TO_PREVIOUS_QUESTION' }
  | { type: 'UPDATE_PLAN_MODIFICATION_DRAFT'; value: Partial<PlanModificationDraft> }
  | { type: 'SELECT_PLAN_VERSION'; planId: string }
  | { type: 'PLAN_REQUEST_STARTED' }
  | { type: 'PLAN_CREATE_SUCCEEDED'; result: PlanCreateResult }
  | { type: 'PLAN_REVISE_SUCCEEDED'; result: PlanReviseResult }
  | { type: 'PLAN_ACCEPT_SUCCEEDED'; result: PlanAcceptResult }
  | { type: 'PLAN_REQUEST_FAILED'; error: ApiErrorState }
  | { type: 'REOPEN_QUESTIONS' }
  | { type: 'START_ACTION' }
  | { type: 'UPDATE_FEEDBACK_DRAFT'; value: Partial<FeedbackPayload> }
  | { type: 'ACTION_RESULT_REQUEST_STARTED' }
  | { type: 'ACTION_RESULT_SUCCEEDED'; result: ActionSubmissionResult }
  | { type: 'ACTION_RESULT_REQUEST_FAILED'; error: ApiErrorState }
  | { type: 'ACTION_RESULT_READBACK_FAILED'; error: ApiErrorState }
  | { type: 'OPEN_CORRECTION_TARGET'; target: CorrectionTarget }
  | { type: 'CLOSE_CORRECTION_TARGET' }
  | { type: 'UPDATE_CORRECTION_TYPE'; correctionType: CorrectionType | null }
  | { type: 'UPDATE_CORRECTION_DRAFT'; value: string }
  | { type: 'UPDATE_CORRECTION_REASON'; value: string }
  | { type: 'UPDATE_CORRECTION_CONFIRMATION'; confirmed: boolean }
  | { type: 'CORRECTION_REQUEST_STARTED' }
  | { type: 'CORRECTION_REQUEST_SUCCEEDED'; result: UserCorrectionResult }
  | { type: 'CORRECTION_REQUEST_FAILED'; error: ApiErrorState }
  | { type: 'CORRECTION_READBACK_FAILED'; error: ApiErrorState }
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

export function interactionReducer(state: DemoSessionState, action: InteractionAction): DemoSessionState {
  switch (action.type) {
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
        return {
          ...state,
          activeThread,
          activeThreadId: activeThread?.id ?? null,
          availableThreads: action.threads,
          apiError: null,
          dataSource: 'api',
        }
      }

    case 'THREAD_CREATED':
      return {
        ...state,
        activeThread: action.thread,
        activeThreadId: action.thread.id,
        availableThreads: mergeThread(state.availableThreads, action.thread),
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

    case 'THREAD_AGGREGATE_LOADED': {
      const aggregate = action.aggregate
      const sameThread = state.activeThreadId === aggregate.thread.id
      const useServerWorkflow = aggregate.serverStep !== 'idle'
      const preserveLocalDraft = sameThread && !useServerWorkflow
      const activeSession = aggregate.activeUnderstandingSession
      const serverUnderstanding = useServerWorkflow ? aggregate.understanding : state.serverUnderstanding
      const preserveAnswerDraft = sameThread
        && state.currentQuestionIndex === aggregate.currentQuestionIndex
      const sameActionResult = Boolean(
        aggregate.latestActionResult
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
        && state.currentStep === 'action_pending'
        && aggregate.currentPlan?.status === 'accepted'
        && state.actionFeedback.planId === aggregate.currentPlan.id,
      )
      const sameCorrectionSnapshot = Boolean(
        state.latestCorrectionResult
        && state.latestCorrectionResult.snapshot.id === aggregate.snapshot.id
        && state.latestCorrectionResult.snapshot.version === aggregate.snapshot.version,
      )
      const preserveSnapshotComparison = sameActionResult || sameCorrectionSnapshot
      return {
        ...state,
        activeThread: aggregate.thread,
        activeThreadId: aggregate.thread.id,
        availableThreads: mergeThread(state.availableThreads, aggregate.thread),
        serverStep: aggregate.serverStep,
        currentStep: preserveFeedbackDraft
          ? 'action_pending'
          : preserveLocalDraft ? state.currentStep : aggregate.serverStep,
        uiThreadStatus: preserveLocalDraft ? state.uiThreadStatus : aggregate.thread.status,
        uiThreadPhase: preserveLocalDraft ? state.uiThreadPhase : aggregate.thread.phase,
        activeUnderstandingSession: useServerWorkflow
          ? activeSession
          : state.activeUnderstandingSession,
        understandingSessionId: useServerWorkflow
          ? activeSession?.id ?? null
          : state.understandingSessionId,
        understandingStatus: useServerWorkflow
          ? activeSession?.status ?? 'idle'
          : state.understandingStatus,
        understandingConfirmedAt: useServerWorkflow
          ? activeSession?.confirmedAt ?? null
          : state.understandingConfirmedAt,
        serverUnderstanding,
        understandingRequestStatus: useServerWorkflow ? 'success' : state.understandingRequestStatus,
        understandingApiError: null,
        understandingSource: useServerWorkflow ? 'api' : state.understandingSource,
        lastSuccessfulUnderstandingAt: useServerWorkflow
          ? activeSession?.updatedAt ?? state.lastSuccessfulUnderstandingAt
          : state.lastSuccessfulUnderstandingAt,
        expressionMode: useServerWorkflow ? aggregate.expressionMode : state.expressionMode,
        userInput: useServerWorkflow ? aggregate.userInput : state.userInput,
        currentAnswerDraft: useServerWorkflow
          ? preserveAnswerDraft
            ? state.currentAnswerDraft
            : aggregate.currentQuestion
              ? aggregate.answers[aggregate.currentQuestion.id] ?? ''
              : ''
          : state.currentAnswerDraft,
        answers: useServerWorkflow ? aggregate.answers : state.answers,
        submittedAnswers: useServerWorkflow ? aggregate.answers : state.submittedAnswers,
        answerMeta: useServerWorkflow ? aggregate.answerMeta : state.answerMeta,
        currentQuestionIndex: useServerWorkflow
          ? aggregate.currentQuestionIndex
          : state.currentQuestionIndex,
        currentQuestion: useServerWorkflow ? aggregate.currentQuestion : state.currentQuestion,
        understanding: useServerWorkflow ? aggregate.understanding : state.understanding,
        corrections: useServerWorkflow ? aggregate.corrections : state.corrections,
        currentPlan: useServerWorkflow ? aggregate.currentPlan : state.currentPlan,
        planVersions: useServerWorkflow ? aggregate.planVersions : state.planVersions,
        activePlanId: useServerWorkflow ? aggregate.thread.activePlanId : state.activePlanId,
        planRequestStatus: useServerWorkflow && aggregate.currentPlan ? 'success' : state.planRequestStatus,
        planApiError: null,
        planSource: useServerWorkflow && aggregate.currentPlan ? 'api' : state.planSource,
        lastSuccessfulPlanAt: useServerWorkflow && aggregate.currentPlan
          ? aggregate.currentPlan.updatedAt ?? aggregate.currentPlan.createdAt
          : state.lastSuccessfulPlanAt,
        lastViewedPlanId: useServerWorkflow && aggregate.currentPlan
          ? aggregate.planVersions.some((plan) => plan.id === state.lastViewedPlanId)
            ? state.lastViewedPlanId
            : aggregate.currentPlan.id
          : state.lastViewedPlanId,
        latestActionResult,
        systemRevision: useServerWorkflow ? aggregate.systemRevision : state.systemRevision,
        actionResultId: latestActionResult?.id ?? null,
        actionResultStatus: latestActionResult?.resultStatus ?? null,
        actionResultSubmittedAt: latestActionResult?.submittedAt ?? null,
        actionResultRequestStatus: latestActionResult ? 'success' : 'idle',
        actionResultApiError: null,
        actionResultSource: latestActionResult ? 'api' : state.actionResultSource,
        latestSnapshot: aggregate.snapshot,
        previousSnapshot: preserveSnapshotComparison ? state.previousSnapshot : null,
        snapshotDiff: preserveSnapshotComparison ? state.snapshotDiff : null,
        latestActionHypothesis: sameActionResult ? state.latestActionHypothesis : null,
        systemRevisionSource: aggregate.systemRevision ? 'api' : state.systemRevisionSource,
        systemRevisionAt: latestActionResult?.submittedAt ?? state.systemRevisionAt,
        correctionRequestStatus: sameCorrectionSnapshot ? 'success' : state.correctionRequestStatus,
        correctionApiError: null,
        correctionSource: sameCorrectionSnapshot ? 'api' : state.correctionSource,
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
          serverSnapshot: snapshot,
          snapshotId: snapshot.id,
          snapshotVersion: snapshot.version,
          systemSnapshot: snapshot,
          latestSnapshot: snapshot,
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
        || !['plan_accepted', 'system_revised'].includes(state.serverStep)
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

    case 'OPEN_CORRECTION_TARGET':
      return {
        ...state,
        activeCorrectionTarget: action.target,
        correctionType: null,
        correctionDraft: '',
        correctionReason: '',
        correctionDiscontinueConfirmed: false,
        correctionRequestStatus: 'idle',
        correctionApiError: null,
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
