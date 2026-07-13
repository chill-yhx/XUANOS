import {
  createInitialSession,
  reviseSystem,
} from '../data/interactionMock'
import { understandingQuestions } from '../data/understandingQuestions'
import type {
  ActiveThread,
  ApiErrorState,
  DemoSessionState,
  ExpressionMode,
  FeedbackPayload,
  PlanAcceptResult,
  PlanCreateResult,
  PlanModificationDraft,
  PlanReviseResult,
  PlanVersion,
  SystemSection,
  SystemSnapshot,
  ThreadAggregateState,
  UnderstandingAnalyzeResult,
  UnderstandingAssessment,
  UnderstandingConfirmResult,
} from '../types'

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
  | { type: 'SUBMIT_FEEDBACK' }
  | { type: 'APPLY_SYSTEM_REVISION' }
  | { type: 'ADD_SYSTEM_CORRECTION'; action: string; section: SystemSection }
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
        dataSource: state.serverSnapshot || state.activeThread ? 'cache' : 'mock',
        understandingSource: state.serverUnderstanding ? 'cache' : state.understandingSource,
        planSource: state.currentPlan && state.planSource !== 'mock' ? 'cache' : state.planSource,
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
        planSource: 'mock',
        lastSuccessfulPlanAt: null,
        lastViewedPlanId: null,
        planModificationDraft: {
          reason: null,
          userChoice: '',
          expectedImpactAcknowledged: false,
        },
        isLoading: false,
        apiError: null,
        isOfflineCache: false,
        dataSource: 'api',
      }

    case 'THREAD_AGGREGATE_LOADED': {
      const aggregate = action.aggregate
      const sameThread = state.activeThreadId === aggregate.thread.id
      const useServerWorkflow = aggregate.serverStep !== 'idle'
      const preserveLocalMock = sameThread && !useServerWorkflow
      const activeSession = aggregate.activeUnderstandingSession
      const serverUnderstanding = useServerWorkflow ? aggregate.understanding : state.serverUnderstanding
      const preserveAnswerDraft = sameThread
        && state.currentQuestionIndex === aggregate.currentQuestionIndex
      return {
        ...state,
        activeThread: aggregate.thread,
        activeThreadId: aggregate.thread.id,
        availableThreads: mergeThread(state.availableThreads, aggregate.thread),
        serverStep: aggregate.serverStep,
        currentStep: preserveLocalMock ? state.currentStep : aggregate.serverStep,
        uiThreadStatus: preserveLocalMock ? state.uiThreadStatus : aggregate.thread.status,
        uiThreadPhase: preserveLocalMock ? state.uiThreadPhase : aggregate.thread.phase,
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
        latestActionResult: aggregate.latestActionResult,
        systemRevision: useServerWorkflow ? aggregate.systemRevision : state.systemRevision,
        serverSnapshot: aggregate.snapshot,
        snapshotId: aggregate.snapshot.id,
        snapshotVersion: aggregate.snapshot.version,
        apiError: null,
        isOfflineCache: false,
        dataSource: 'api',
      }
    }

    case 'SNAPSHOT_LOADED':
      if (state.serverSnapshot && action.snapshot.version < state.serverSnapshot.version) return state
      return {
        ...state,
        serverSnapshot: action.snapshot,
        snapshotId: action.snapshot.id,
        snapshotVersion: action.snapshot.version,
        apiError: null,
        isOfflineCache: false,
        dataSource: 'api',
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
        || state.serverStep !== 'plan_accepted'
        || state.planSource !== 'api'
        || state.isOfflineCache
      ) return state
      return withThread(
        { ...state, currentStep: 'action_pending' },
        '等待行动反馈',
        state.currentPlan.stage,
      )

    case 'UPDATE_FEEDBACK_DRAFT':
      return { ...state, actionFeedback: { ...state.actionFeedback, ...action.value } }

    case 'SUBMIT_FEEDBACK':
      if (state.currentStep !== 'action_pending' || state.currentPlan?.status !== 'accepted') return state
      return withThread(
        { ...state, currentStep: 'feedback_submitted' },
        '正在修正系统',
        '处理行动结果',
      )

    case 'APPLY_SYSTEM_REVISION': {
      if (state.currentStep !== 'feedback_submitted' || !state.currentPlan) return state
      const { snapshot, revision } = reviseSystem(state.systemSnapshot, state.actionFeedback, state.currentPlan)
      return withThread(
        {
          ...state,
          systemSnapshot: snapshot,
          systemRevision: revision,
          currentStep: 'system_revised',
        },
        '系统已修正',
        snapshot.currentStage,
      )
    }

    case 'ADD_SYSTEM_CORRECTION': {
      const correction = `${action.section.title}：${action.action}`
      return {
        ...state,
        corrections: [
          ...state.corrections,
          {
            id: `system-correction-${Date.now()}`,
            target: action.section.id,
            assessment: 'system_snapshot',
            previousValue: action.section.entries.join('；'),
            userValue: action.action,
            createdAt: new Date().toISOString(),
          },
        ],
        systemSnapshot: {
          ...state.systemSnapshot,
          userCorrections: [correction, ...state.systemSnapshot.userCorrections].slice(0, 4),
        },
      }
    }

    case 'RESET_DEMO_DATA':
      return createInitialSession()

    default:
      return state
  }
}
