import { createInitialSession } from '../data/interactionMock'
import type { DemoSessionState, InteractionStep } from '../types'

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
  mock: Pick<
    DemoSessionState,
    | 'currentStep'
    | 'uiThreadStatus'
    | 'uiThreadPhase'
    | 'expressionMode'
    | 'userInput'
    | 'answers'
    | 'currentQuestionIndex'
    | 'understanding'
    | 'corrections'
    | 'currentPlan'
    | 'planVersions'
    | 'actionFeedback'
    | 'systemRevision'
    | 'systemSnapshot'
  >
}

function isStep(value: unknown): value is InteractionStep {
  return typeof value === 'string' && validSteps.has(value as InteractionStep)
}

function restoreV2(fallback: DemoSessionState, parsed: Partial<IntegrationCache>): DemoSessionState {
  const server = parsed.server
  const mock = parsed.mock
  const serverSnapshot = server?.serverSnapshot ?? null
  const activeThread = server?.activeThread ?? null
  const currentStep = isStep(mock?.currentStep) ? mock.currentStep : fallback.currentStep
  const serverStep = isStep(server?.serverStep) ? server.serverStep : fallback.serverStep
  return {
    ...fallback,
    ...mock,
    schemaVersion: 2,
    currentStep,
    serverStep,
    activeThread,
    activeThreadId: activeThread?.id ?? parsed.lastThreadId ?? null,
    availableThreads: server?.availableThreads ?? [],
    serverSnapshot,
    snapshotId: serverSnapshot?.id ?? null,
    snapshotVersion: serverSnapshot?.version ?? null,
    isOfflineCache: Boolean(activeThread || serverSnapshot),
    dataSource: activeThread || serverSnapshot ? 'cache' : 'mock',
    isLoading: false,
    apiError: null,
    answers: mock?.answers ?? {},
    corrections: mock?.corrections ?? [],
    planVersions: mock?.planVersions ?? [],
    actionFeedback: { ...fallback.actionFeedback, ...mock?.actionFeedback },
  }
}

function restoreLegacy(fallback: DemoSessionState): DemoSessionState {
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return fallback
    const legacy = JSON.parse(raw) as Partial<DemoSessionState>
    return {
      ...fallback,
      currentStep: isStep(legacy.currentStep) ? legacy.currentStep : fallback.currentStep,
      expressionMode: legacy.expressionMode ?? null,
      userInput: legacy.userInput ?? '',
      answers: legacy.answers ?? {},
      currentQuestionIndex: legacy.currentQuestionIndex ?? 0,
      understanding: legacy.understanding ?? null,
      corrections: legacy.corrections ?? [],
      currentPlan: legacy.currentPlan ?? null,
      planVersions: legacy.planVersions ?? [],
      systemRevision: legacy.systemRevision ?? null,
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
    mock: {
      currentStep: state.currentStep,
      uiThreadStatus: state.uiThreadStatus,
      uiThreadPhase: state.uiThreadPhase,
      expressionMode: state.expressionMode,
      userInput: state.userInput,
      answers: state.answers,
      currentQuestionIndex: state.currentQuestionIndex,
      understanding: state.understanding,
      corrections: state.corrections,
      currentPlan: state.currentPlan,
      planVersions: state.planVersions,
      actionFeedback: state.actionFeedback,
      systemRevision: state.systemRevision,
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
