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

export type DataSource = 'api' | 'cache' | 'mock' | 'none'

export type RequestStatus = 'idle' | 'loading' | 'success' | 'error'

export type UnderstandingStatus = 'idle' | 'collecting' | 'reviewing' | 'confirmed'

export type ActionResultStatus = 'completed' | 'partially_completed' | 'not_completed' | 'abandoned'

export type CorrectionType = 'accurate' | 'partial' | 'inaccurate' | 'changed' | 'discontinue'

export type CorrectionTargetType =
  | 'understanding'
  | 'goal'
  | 'constraint'
  | 'plan'
  | 'snapshot'
  | 'hypothesis'
  | 'system_section'

export type CorrectionTargetArea = 'vector' | 'action' | 'boundary' | 'pattern' | 'hypothesis' | 'state'

export type ActionObstacleCode =
  | 'low_energy'
  | 'unclear_action'
  | 'lack_of_time'
  | 'emotional_resistance'
  | 'environment_interrupt'
  | 'missing_resource'
  | 'task_too_large'
  | 'other'

export interface ApiErrorState {
  code: string
  message: string
  status: number | null
  requestId: string | null
}

export interface RequestScope {
  userId: string
  threadId: string
  generation: number
}

export interface PriorityGroup {
  title: string
  label: string
  tone: TagTone
  items: string[]
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
  resultStatus: ActionResultStatus | null
  progressPercent: number
  actualDurationMinutes: number | null
  obstacleCode: ActionObstacleCode | null
  userNote: string
  energyChange: string
  unrealisticPart: string
  planId: string | null
  planItemId: string | null
  actionIdentifier: string | null
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
  userId?: string
  threadId?: string | null
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
  threadId?: string
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
  confidence?: number | null
  supportCount?: number | null
}

export interface HypothesisSummary {
  id: string
  content: string
  status: string
  confidence?: number | null
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
  userId: string
  threadId: string
  planId: string
  planItemId: string | null
  actionIdentifier: string
  resultStatus: ActionResultStatus
  started: boolean
  completed: boolean
  progressPercent: number
  actualDurationMinutes: number | null
  obstacleCode: string
  userNote: string | null
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

export interface ActionHypothesis {
  id: string
  content: string
  category: string
  status: string
  supportingEvidence: Array<Record<string, unknown>>
  opposingEvidence: Array<Record<string, unknown>>
  lastReviewedAt: string | null
  createdAt: string
  updatedAt: string
}

export type SnapshotChangeKind = 'added' | 'modified' | 'retained' | 'weakened' | 'rejected'

export type SnapshotChangeArea = 'hypothesis' | 'pattern' | 'focus' | 'action' | 'boundary'

export interface SnapshotChange {
  id: string
  kind: SnapshotChangeKind
  area: SnapshotChangeArea
  label: string
  before: string | null
  after: string | null
}

export interface SnapshotDiff {
  fromSnapshotId: string | null
  toSnapshotId: string | null
  fromVersion: number | null
  toVersion: number
  hasChanges: boolean
  isComparable: boolean
  changes: SnapshotChange[]
}

export interface CorrectionTarget {
  key: string
  targetType: CorrectionTargetType
  targetId: string
  area: CorrectionTargetArea
  label: string
  originalValue: string
  snapshotId: string
  snapshotVersion: number
}

export interface UserCorrectionResult {
  correction: CorrectionRecord
  snapshot: SystemSnapshot
  snapshotUpdated: boolean
  previousSnapshot: SystemSnapshot
  snapshotDiff: SnapshotDiff
}

export interface ActionSubmissionResult {
  actionResult: ActionResult
  systemRevision: SystemRevision
  hypothesis: ActionHypothesis
  snapshot: SystemSnapshot
  previousSnapshot: SystemSnapshot | null
  snapshotDiff: SnapshotDiff
  currentStep: InteractionStep
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
  activeThreadGeneration: number
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
  actionResultId: string | null
  actionResultStatus: ActionResultStatus | null
  actionResultSubmittedAt: string | null
  actionResultRequestStatus: RequestStatus
  actionResultApiError: ApiErrorState | null
  actionResultSource: DataSource
  latestSnapshot: SystemSnapshot | null
  previousSnapshot: SystemSnapshot | null
  snapshotDiff: SnapshotDiff | null
  latestActionHypothesis: ActionHypothesis | null
  systemRevisionSource: DataSource
  systemRevisionAt: string | null
  systemRevision: SystemRevision | null
  activeCorrectionTarget: CorrectionTarget | null
  correctionType: CorrectionType | null
  correctionDraft: string
  correctionReason: string
  correctionDiscontinueConfirmed: boolean
  correctionRequestStatus: RequestStatus
  correctionApiError: ApiErrorState | null
  latestCorrectionId: string | null
  latestCorrectionAt: string | null
  latestCorrectionResult: UserCorrectionResult | null
  correctionSource: DataSource
  systemSnapshot: SystemSnapshot
}
