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
  duration: string
  obstacle: string
  energyChange: string
  note: string
}

export interface UnderstandingSummary {
  realGoal: string
  foundation: string
  constraints: string
  tension: string
  uncertain: string
}

export interface CorrectionRecord {
  id: string
  target: string
  assessment: UnderstandingAssessment | 'system_snapshot'
  previousValue: string
  userValue: string
  createdAt: string
}

export type PlanModificationReason =
  | '时间冲突'
  | '资源限制'
  | '能力限制'
  | '身体或安全原因'
  | '个人偏好'
  | '不认可系统判断'
  | '其他'

export interface PlanVersion {
  id: string
  version: number
  status: 'generated' | 'accepted' | 'superseded'
  mainGoal: string
  maintenanceGoals: string[]
  pausedGoals: string[]
  removedItems: string[]
  stage: string
  singleAction: string
  completionStandard: string
  reviewCondition: string
  workload: string
  systemRecommendation: string
  userFinalChoice?: string
  modificationReason?: PlanModificationReason
  expectedImpact?: string
  isUserFinalChoice: boolean
  createdAt: string
}

export interface SystemRevision {
  originalJudgment: string
  actualResult: string
  revisedJudgment: string
  nextAdjustment: string
}

export interface SystemSnapshot {
  currentVector: string
  currentStage: string
  currentAction: string
  realityBoundaries: string[]
  effectivePatterns: string[]
  hypotheses: string[]
  recentRevisions: string[]
  userCorrections: string[]
  revisionCount: number
  lastUpdatedAt: string | null
}

export interface ActiveThread {
  id: string
  title: string
  status: string
  phase: string
  lastUpdatedAt: string
}

export interface DemoSessionState {
  schemaVersion: 1
  currentStep: InteractionStep
  expressionMode: ExpressionMode | null
  userInput: string
  answers: Partial<Record<QuestionId, string>>
  currentQuestionIndex: number
  understanding: UnderstandingSummary | null
  corrections: CorrectionRecord[]
  currentPlan: PlanVersion | null
  planVersions: PlanVersion[]
  actionFeedback: FeedbackPayload
  systemRevision: SystemRevision | null
  systemSnapshot: SystemSnapshot
  activeThread: ActiveThread
}
