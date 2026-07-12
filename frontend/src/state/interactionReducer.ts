import { createInitialSession, createModifiedPlan, generatePlan, generateUnderstanding, interactionQuestions, reviseSystem } from '../data/interactionMock'
import type {
  DemoSessionState,
  ExpressionMode,
  FeedbackPayload,
  PlanModificationReason,
  SystemSection,
  UnderstandingAssessment,
} from '../types'

export type InteractionAction =
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

function withThread(state: DemoSessionState, status: string, phase = state.activeThread.phase): DemoSessionState {
  return {
    ...state,
    activeThread: {
      ...state.activeThread,
      status,
      phase,
      lastUpdatedAt: new Date().toISOString(),
    },
  }
}

export function interactionReducer(state: DemoSessionState, action: InteractionAction): DemoSessionState {
  switch (action.type) {
    case 'START_CALIBRATION':
      return withThread({ ...state, currentStep: 'expression_mode' }, '正在理解', '选择表达方式')

    case 'SELECT_EXPRESSION_MODE':
      return withThread({
        ...state,
        expressionMode: action.mode,
        currentStep: action.mode === 'ask' ? 'asking_question' : 'collecting_input',
      }, '正在理解', action.mode === 'ask' ? '理解目标' : '收集表达')

    case 'UPDATE_USER_INPUT':
      return { ...state, userInput: action.value }

    case 'SUBMIT_USER_INPUT':
      if (!state.expressionMode || !state.userInput.trim()) return state
      return withThread({ ...state, currentStep: 'asking_question' }, '正在理解', '理解目标')

    case 'ANSWER_QUESTION': { const answer = action.answer.trim()
      if (!answer) return state
      const question = interactionQuestions[state.currentQuestionIndex]
      if (!question) return state
      const answers = { ...state.answers, [question.id]: answer }
      const isLast = state.currentQuestionIndex === interactionQuestions.length - 1
      return withThread({
        ...state,
        answers,
        currentQuestionIndex: isLast ? state.currentQuestionIndex : state.currentQuestionIndex + 1,
        currentStep: isLast ? 'reviewing_understanding' : 'asking_question',
        understanding: isLast ? generateUnderstanding(state.userInput, answers) : state.understanding,
      }, '正在理解', isLast ? '理解确认' : '核对现实')
    }

    case 'GO_TO_PREVIOUS_QUESTION':
      return {
        ...state,
        currentQuestionIndex: Math.max(0, state.currentQuestionIndex - 1),
        currentStep: 'asking_question',
      }

    case 'ADD_CORRECTION': { const value = action.value.trim()
      if (!value || !state.understanding) return state
      return {
        ...state,
        currentStep: 'reviewing_understanding',
        understanding: { ...state.understanding, uncertain: `用户补充：${value}` },
        corrections: [...state.corrections, {
          id: `correction-${Date.now()}`,
          target: 'understanding',
          assessment: action.assessment,
          previousValue: state.understanding.uncertain,
          userValue: value,
          createdAt: new Date().toISOString(),
        }],
      }
    }

    case 'CONFIRM_UNDERSTANDING':
      if (!state.understanding || interactionQuestions.some((question) => !state.answers[question.id]?.trim())) return state
      return withThread({
        ...state,
        currentStep: 'understanding_confirmed',
        systemSnapshot: {
          ...state.systemSnapshot,
          currentVector: state.understanding.realGoal,
          realityBoundaries: [state.understanding.constraints, ...state.systemSnapshot.realityBoundaries].slice(0, 3),
          userCorrections: [...state.corrections.map((item) => item.userValue), ...state.systemSnapshot.userCorrections].slice(0, 4),
        },
      }, '理解已确认', '起点档案')

    case 'GENERATE_PLAN': { if (state.currentStep !== 'understanding_confirmed' || !state.understanding) return state
      const plan = generatePlan(state)
      const previousVersions = state.planVersions.map((item) => item.id === state.currentPlan?.id ? { ...item, status: 'superseded' as const } : item)
      return withThread({ ...state, currentPlan: plan, planVersions: [...previousVersions, plan], currentStep: 'plan_generated' }, '等待计划确认', '计划裁决')
    }

    case 'MODIFY_PLAN': { const plan = createModifiedPlan(state, action.reason, action.userChoice.trim())
      if (!plan || !action.userChoice.trim()) return state
      const previousVersions = state.planVersions.map((item) => item.id === state.currentPlan?.id ? { ...item, status: 'superseded' as const } : item)
      return withThread({ ...state, currentPlan: plan, planVersions: [...previousVersions, plan], currentStep: 'plan_modified' }, '计划已修改', '等待接受')
    }

    case 'ACCEPT_PLAN': { if (!state.currentPlan || !['plan_generated', 'plan_modified'].includes(state.currentStep)) return state
      const acceptedPlan = { ...state.currentPlan, status: 'accepted' as const }
      return withThread({
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
      }, '计划已接受', acceptedPlan.stage)
    }

    case 'REOPEN_QUESTIONS':
      return withThread({ ...state, currentStep: 'asking_question', currentQuestionIndex: 0 }, '正在重新核对', '理解目标')

    case 'START_ACTION':
      if (state.currentPlan?.status !== 'accepted') return state
      return withThread({ ...state, currentStep: 'action_pending' }, '等待行动反馈', state.currentPlan.stage)

    case 'UPDATE_FEEDBACK_DRAFT':
      return { ...state, actionFeedback: { ...state.actionFeedback, ...action.value } }

    case 'SUBMIT_FEEDBACK':
      if (state.currentStep !== 'action_pending' || state.currentPlan?.status !== 'accepted') return state
      return withThread({ ...state, currentStep: 'feedback_submitted' }, '正在修正系统', '处理行动结果')

    case 'APPLY_SYSTEM_REVISION': { if (state.currentStep !== 'feedback_submitted' || !state.currentPlan) return state
      const { snapshot, revision } = reviseSystem(state.systemSnapshot, state.actionFeedback, state.currentPlan)
      return withThread({ ...state, systemSnapshot: snapshot, systemRevision: revision, currentStep: 'system_revised' }, '系统已修正', snapshot.currentStage)
    }

    case 'ADD_SYSTEM_CORRECTION': { const correction = `${action.section.title}：${action.action}`
      return {
        ...state,
        corrections: [...state.corrections, {
          id: `system-correction-${Date.now()}`,
          target: action.section.id,
          assessment: 'system_snapshot',
          previousValue: action.section.entries.join('；'),
          userValue: action.action,
          createdAt: new Date().toISOString(),
        }],
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
