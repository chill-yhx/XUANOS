export type PageId = 'home' | 'understanding' | 'plan' | 'feedback' | 'system'

export type TagTone = 'gold' | 'muted' | 'success' | 'impact' | 'risk'

export type SystemViewMode = 'profile' | 'diary' | 'mixed'

export type InteractionStep =
  | 'idle'
  | 'expression_mode'
  | 'collecting_input'
  | 'asking_question'
  | 'reviewing_understanding'
  | 'understanding_confirmed'
  | 'plan_generated'
  | 'plan_modified'
  | 'plan_accepted'
  | 'action_pending'
  | 'feedback_submitted'
  | 'system_revised'

export type ExpressionMode = 'speak' | 'ask' | 'sort'

export type QuestionId = 'desired_result' | 'current_foundation' | 'real_constraints'

export type UnderstandingAssessment = 'accurate' | 'partial' | 'inaccurate' | 'supplement'

export type DataSource = 'api' | 'cache' | 'mock'

export type RequestStatus = 'idle' | 'loading' | 'success' | 'error'

export type UnderstandingStatus = 'idle' | 'collecting' | 'reviewing' | 'confirmed'

export interface ApiErrorState {
  code: string
  message: string
  status: number | null
  requestId: string | null
}

export interface ThreadSummary {
  title: string
  status: string
  phase: string
  nextReview: string
}

export interface PriorityGroup {
  title: string
  label: string
  tone: TagTone
  items: string[]
}

export interface TimeBlock {
  label: string
  task: string
}

export interface SystemSection {
  id: string
  title: string
  english: string
  tone: TagTone
  entries: string[]
  footnote?: string
}

export interface FeedbackPayload {
  started: boolean
  completed: boolean
  progress: number
  actualDurationMinutes: number | null
  obstacleCode: string
  obstacleDetail: string
  energyChange: string
  unrealisticPart: string
}

export interface UnderstandingSummary {
  realGoal: string
  foundation: string
  constraints: string
  tension: string
  uncertain: string
}

export interface UnderstandingQuestion {
  id: QuestionId
  prompt: string
  hint: string
  index: number
  total: number
}

export interface UnderstandingSession {
  id: string
  threadId: string
  userId: string
  previousSessionId: string | null
  expressionMode: ExpressionMode
  status: UnderstandingStatus
  userInput: string | null
  currentQuestionIndex: number
  summaryVersion: number
  confirmedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface UnderstandingAnalyzeResult {
  session: UnderstandingSession
  submittedAnswers: Partial<Record<QuestionId, string>>
  answerMeta: Partial<Record<QuestionId, AnswerMetadata>>
  nextQuestion: UnderstandingQuestion | null
  understanding: UnderstandingSummary | null
  currentStep: InteractionStep
}

export interface UnderstandingConfirmResult {
  session: UnderstandingSession
  understanding: UnderstandingSummary
  correction: CorrectionRecord | null
  snapshot: SystemSnapshot | null
  currentStep: InteractionStep
}

export interface AnswerMetadata {
  id: string
  revision: number
  answeredAt: string
  createdAt: string
  updatedAt: string
}

export interface CorrectionRecord {
  id: string
  target: string
  targetType?: string
  targetId?: string | null
  assessment: string
  previousValue: string
  userValue: string
  reason?: string | null
  systemHandling?: string | null
  hasConflict?: boolean
  createdAt: string
  updatedAt?: string
}

export type PlanModificationReason =
  | 'time_conflict'
  | 'resource_limit'
  | 'ability_limit'
  | 'health_or_safety'
  | 'personal_preference'
  | 'reject_system_judgment'
  | 'other'

export interface PlanItem {
  id: string
  itemType: string
  title: string
  timeBlock: string | null
  estimatedMinutes: number | null
  difficulty: number | null
  completionStandard: string | null
  isOptional: boolean
  source: string
  isUserModified: boolean
  modificationNote: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface PlanVersion {
  id: string
  rootPlanId?: string
  previousPlanId?: string | null
  understandingSessionId?: string
  primaryGoalId?: string
  version: number
  status: 'generated' | 'accepted' | 'superseded' | 'cancelled'
  mainGoal: string
  summary?: string
  maintenanceGoals: string[]
  pausedGoals: string[]
  removedItems: string[]
  items?: PlanItem[]
  stage: string
  singleAction: string
  completionStandard: string
  reviewCondition: string
  workload: string
  systemRecommendation: string
  userFinalChoice?: string
  modificationReason?: PlanModificationReason
  expectedImpact?: string
  warningLevel?: string
  isUserFinalChoice: boolean
  acceptedAt?: string | null
  createdAt: string
  updatedAt?: string
}

export interface PlanModificationDraft {
  reason: PlanModificationReason | null
  userChoice: string
  expectedImpactAcknowledged: boolean
}

export interface PlanCreateResult {
  plan: PlanVersion
  currentStep: InteractionStep
}

export interface PlanReviseResult {
  previousPlan: PlanVersion
  currentPlan: PlanVersion
  currentStep: InteractionStep
}

export interface PlanAcceptResult {
  plan: PlanVersion
  snapshot: SystemSnapshot
  currentStep: InteractionStep
}

export interface SystemRevision {
  originalJudgment: string
  actualResult: string
  revisedJudgment: string
  nextAdjustment: string
}

export interface EffectivePattern {
  content: string
  maturity: string
}

export interface HypothesisSummary {
  id: string
  content: string
  status: string
}

export interface SystemSnapshot {
  id: string | null
  userId: string
  version: number
  sourceThreadId: string | null
  sourceActionResultId: string | null
  currentVector: string
  currentStage: string
  currentAction: string
  realityBoundaries: string[]
  effectivePatterns: EffectivePattern[]
  hypotheses: HypothesisSummary[]
  recentRevisions: string[]
  userCorrections: string[]
  revisionCount: number
  createdAt: string | null
  updatedAt: string | null
}

export interface ActionResult {
  id: string
  threadId: string
  planId: string
  started: boolean
  completed: boolean
  progressPercent: number
  actualDurationMinutes: number | null
  obstacleCode: string
  obstacleDetail: string | null
  energyChange: string | null
  unrealisticPart: string | null
  originalJudgment: string
  actualResultSummary: string
  revisedJudgment: string
  nextAdjustment: string
  submittedAt: string
  createdAt: string
  updatedAt: string
}

export interface ActiveThread {
  id: string
  userId: string
  title: string
  status: string
  currentStep: InteractionStep
  phase: string
  activeUnderstandingSessionId: string | null
  activePlanId: string | null
  lastActivityAt: string
  createdAt: string
  updatedAt: string
}

export interface ThreadAggregateState {
  thread: ActiveThread
  serverStep: InteractionStep
  activeUnderstandingSession: UnderstandingSession | null
  expressionMode: ExpressionMode | null
  userInput: string
  answers: Partial<Record<QuestionId, string>>
  answerMeta: Partial<Record<QuestionId, AnswerMetadata>>
  currentQuestionIndex: number
  currentQuestion: UnderstandingQuestion | null
  understanding: UnderstandingSummary | null
  corrections: CorrectionRecord[]
  currentPlan: PlanVersion | null
  planVersions: PlanVersion[]
  latestActionResult: ActionResult | null
  systemRevision: SystemRevision | null
  snapshot: SystemSnapshot
}

export interface DemoSessionState {
  schemaVersion: 2
  currentStep: InteractionStep
  serverStep: InteractionStep
  isLoading: boolean
  apiError: ApiErrorState | null
  isOfflineCache: boolean
  dataSource: DataSource
  activeThreadId: string | null
  snapshotId: string | null
  snapshotVersion: number | null
  availableThreads: ActiveThread[]
  activeThread: ActiveThread | null
  uiThreadStatus: string
  uiThreadPhase: string
  activeUnderstandingSession: UnderstandingSession | null
  understandingSessionId: string | null
  understandingStatus: UnderstandingStatus
  understandingConfirmedAt: string | null
  serverUnderstanding: UnderstandingSummary | null
  understandingRequestStatus: RequestStatus
  understandingApiError: ApiErrorState | null
  understandingSource: DataSource
  lastSuccessfulUnderstandingAt: string | null
  answerMeta: Partial<Record<QuestionId, AnswerMetadata>>
  latestActionResult: ActionResult | null
  serverSnapshot: SystemSnapshot | null
  expressionMode: ExpressionMode | null
  userInput: string
  currentAnswerDraft: string
  understandingAssessmentDraft: UnderstandingAssessment | null
  understandingCorrectionDraft: string
  answers: Partial<Record<QuestionId, string>>
  submittedAnswers: Partial<Record<QuestionId, string>>
  currentQuestionIndex: number
  currentQuestion: UnderstandingQuestion | null
  understanding: UnderstandingSummary | null
  corrections: CorrectionRecord[]
  currentPlan: PlanVersion | null
  planVersions: PlanVersion[]
  activePlanId: string | null
  planRequestStatus: RequestStatus
  planApiError: ApiErrorState | null
  planSource: DataSource
  lastSuccessfulPlanAt: string | null
  lastViewedPlanId: string | null
  planModificationDraft: PlanModificationDraft
  actionFeedback: FeedbackPayload
  systemRevision: SystemRevision | null
  systemSnapshot: SystemSnapshot
}
