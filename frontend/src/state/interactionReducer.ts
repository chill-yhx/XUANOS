import {
  createInitialSession,
  createModifiedPlan,
  generatePlan,
  generateUnderstanding,
  interactionQuestions,
  reviseSystem,
} from '../data/interactionMock'
import type {
  ActiveThread,
  ApiErrorState,
  DemoSessionState,
  ExpressionMode,
  FeedbackPayload,
  PlanModificationReason,
  SystemSection,
  SystemSnapshot,
  ThreadAggregateState,
  UnderstandingAssessment,
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
  | { type: 'SUBMIT_USER_INPUT' }
  | { type: 'ANSWER_QUESTION'; answer: string }
  | { type: 'GO_TO_PREVIOUS_QUESTION' }
  | { type: 'ADD_CORRECTION'; assessment: UnderstandingAssessment; value: string }
  | { type: 'CONFIRM_UNDERSTANDING' }
  | { type: 'GENERATE_PLAN' }
  | { type: 'MODIFY_PLAN'; reason: PlanModificationReason; userChoice: string }
  | { type: 'ACCEPT_PLAN' }
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
          ? aggregate.activeUnderstandingSession
          : state.activeUnderstandingSession,
        expressionMode: useServerWorkflow ? aggregate.expressionMode : state.expressionMode,
        userInput: useServerWorkflow ? aggregate.userInput : state.userInput,
        answers: useServerWorkflow ? aggregate.answers : state.answers,
        answerMeta: useServerWorkflow ? aggregate.answerMeta : state.answerMeta,
        currentQuestionIndex: useServerWorkflow
          ? aggregate.currentQuestionIndex
          : state.currentQuestionIndex,
        understanding: useServerWorkflow ? aggregate.understanding : state.understanding,
        corrections: useServerWorkflow ? aggregate.corrections : state.corrections,
        currentPlan: useServerWorkflow ? aggregate.currentPlan : state.currentPlan,
        planVersions: useServerWorkflow ? aggregate.planVersions : state.planVersions,
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
          currentStep: action.mode === 'ask' ? 'asking_question' : 'collecting_input',
        },
        '正在理解',
        action.mode === 'ask' ? '理解目标' : '收集表达',
      )

    case 'UPDATE_USER_INPUT':
      return { ...state, userInput: action.value }

    case 'SUBMIT_USER_INPUT':
      if (!state.expressionMode || !state.userInput.trim()) return state
      return withThread({ ...state, currentStep: 'asking_question' }, '正在理解', '理解目标')

    case 'ANSWER_QUESTION': {
      const answer = action.answer.trim()
      if (!answer) return state
      const question = interactionQuestions[state.currentQuestionIndex]
      if (!question) return state
      const answers = { ...state.answers, [question.id]: answer }
      const isLast = state.currentQuestionIndex === interactionQuestions.length - 1
      return withThread(
        {
          ...state,
          answers,
          currentQuestionIndex: isLast ? state.currentQuestionIndex : state.currentQuestionIndex + 1,
          currentStep: isLast ? 'reviewing_understanding' : 'asking_question',
          understanding: isLast ? generateUnderstanding(state.userInput, answers) : state.understanding,
        },
        '正在理解',
        isLast ? '理解确认' : '核对现实',
      )
    }

    case 'GO_TO_PREVIOUS_QUESTION':
      return {
        ...state,
        currentQuestionIndex: Math.max(0, state.currentQuestionIndex - 1),
        currentStep: 'asking_question',
      }

    case 'ADD_CORRECTION': {
      const value = action.value.trim()
      if (!value || !state.understanding) return state
      return {
        ...state,
        currentStep: 'reviewing_understanding',
        understanding: { ...state.understanding, uncertain: `用户补充：${value}` },
        corrections: [
          ...state.corrections,
          {
            id: `correction-${Date.now()}`,
            target: 'understanding',
            assessment: action.assessment,
            previousValue: state.understanding.uncertain,
            userValue: value,
            createdAt: new Date().toISOString(),
          },
        ],
      }
    }

    case 'CONFIRM_UNDERSTANDING':
      if (!state.understanding || interactionQuestions.some((question) => !state.answers[question.id]?.trim())) {
        return state
      }
      return withThread(
        {
          ...state,
          currentStep: 'understanding_confirmed',
          systemSnapshot: {
            ...state.systemSnapshot,
            currentVector: state.understanding.realGoal,
            realityBoundaries: [state.understanding.constraints, ...state.systemSnapshot.realityBoundaries].slice(0, 3),
            userCorrections: [
              ...state.corrections.map((item) => item.userValue),
              ...state.systemSnapshot.userCorrections,
            ].slice(0, 4),
          },
        },
        '理解已确认',
        '起点档案',
      )

    case 'GENERATE_PLAN': {
      if (state.currentStep !== 'understanding_confirmed' || !state.understanding) return state
      const plan = generatePlan(state)
      const previousVersions = state.planVersions.map((item) =>
        item.id === state.currentPlan?.id ? { ...item, status: 'superseded' as const } : item,
      )
      return withThread(
        {
          ...state,
          currentPlan: plan,
          planVersions: [...previousVersions, plan],
          currentStep: 'plan_generated',
        },
        '等待计划确认',
        '计划裁决',
      )
    }

    case 'MODIFY_PLAN': {
      const plan = createModifiedPlan(state, action.reason, action.userChoice.trim())
      if (!plan || !action.userChoice.trim()) return state
      const previousVersions = state.planVersions.map((item) =>
        item.id === state.currentPlan?.id ? { ...item, status: 'superseded' as const } : item,
      )
      return withThread(
        {
          ...state,
          currentPlan: plan,
          planVersions: [...previousVersions, plan],
          currentStep: 'plan_modified',
        },
        '计划已修改',
        '等待接受',
      )
    }

    case 'ACCEPT_PLAN': {
      if (!state.currentPlan || !['plan_generated', 'plan_modified'].includes(state.currentStep)) return state
      const acceptedPlan = { ...state.currentPlan, status: 'accepted' as const }
      return withThread(
        {
          ...state,
          currentPlan: acceptedPlan,
          planVersions: state.planVersions.map((item) => item.id === acceptedPlan.id ? acceptedPlan : item),
          currentStep: 'plan_accepted',
          systemSnapshot: {
            ...state.systemSnapshot,
            currentVector: acceptedPlan.mainGoal,
            currentStage: acceptedPlan.stage,
            currentAction: acceptedPlan.singleAction,
          },
        },
        '计划已接受',
        acceptedPlan.stage,
      )
    }

    case 'REOPEN_QUESTIONS':
      return withThread(
        { ...state, currentStep: 'asking_question', currentQuestionIndex: 0 },
        '正在重新核对',
        '理解目标',
      )

    case 'START_ACTION':
      if (state.currentPlan?.status !== 'accepted') return state
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
