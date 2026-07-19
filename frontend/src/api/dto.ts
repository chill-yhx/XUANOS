export interface ApiEnvelope<T> {
  data: T
  meta: {
    request_id: string
    next_cursor: string | null
  }
}

export interface AuthUserDto {
  id: string
  phone_masked: string
  display_name: string | null
  status: 'active' | 'disabled'
  phone_verified: boolean
  has_password: boolean
}

export interface AuthSessionDto {
  user: AuthUserDto
  expires_at: string
  needs_password_setup: boolean
}

export interface SendCodeResultDto {
  accepted: boolean
  retry_after_seconds: number
  message: string
}

export interface AuthOperationResultDto {
  completed: boolean
  message: string
}

export interface ThreadDto {
  id: string
  user_id: string
  title: string
  status: string
  current_step: string
  phase: string
  active_understanding_session_id: string | null
  active_plan_id: string | null
  last_activity_at: string
  created_at: string
  updated_at: string
}

export interface SnapshotDto {
  id: string
  user_id: string
  version: number
  source_thread_id: string | null
  source_action_result_id: string | null
  current_vector: string
  current_stage: string
  current_action: string
  reality_boundaries: string[]
  effective_patterns: Array<Record<string, unknown>>
  hypotheses: Array<Record<string, unknown>>
  recent_revisions: string[]
  user_corrections: string[]
  revision_count: number
  created_at: string
  updated_at: string
}

export interface UnderstandingSessionDto {
  id: string
  thread_id: string
  user_id: string
  previous_session_id: string | null
  expression_mode: string
  status: string
  user_input: string | null
  current_question_index: number
  summary_version: number
  confirmed_at: string | null
  created_at: string
  updated_at: string
}

export interface AnswerDto {
  id: string
  question_id: string
  question_text: string
  question_order: number
  answer_text: string
  revision: number
  is_current: boolean
  answered_at: string
  created_at: string
  updated_at: string
}

export interface UnderstandingSummaryDto {
  real_goal: string
  foundation: string
  constraints: string
  tension: string
  uncertain: string
}

export interface UnderstandingQuestionDto {
  id: string
  prompt: string
  hint: string
  index: number
  total: number
}

export interface UnderstandingAnswerInputDto {
  question_id: string
  answer_text: string
}

export interface UnderstandingAnalyzeRequestDto {
  thread_id: string
  session_id?: string | null
  expression_mode?: string | null
  user_input?: string | null
  answer?: UnderstandingAnswerInputDto | null
}

export interface UnderstandingAnalyzeResultDto {
  session: UnderstandingSessionDto
  current_answers: AnswerDto[]
  next_question: UnderstandingQuestionDto | null
  understanding: UnderstandingSummaryDto | null
  current_step: string
}

export interface UnderstandingConfirmRequestDto {
  assessment: string
  correction: string | null
}

export interface UnderstandingConfirmResultDto {
  session: UnderstandingSessionDto
  understanding: UnderstandingSummaryDto
  correction: CorrectionDto | null
  snapshot: SnapshotDto | null
  current_step: string
}

export interface CorrectionDto {
  id: string
  target_type: string
  target_id: string | null
  assessment: string
  previous_value: string
  user_value: string
  reason: string | null
  system_handling: string | null
  has_conflict: boolean
  created_at: string
  updated_at: string
}

export interface UserCorrectionCreateDto {
  expected_snapshot_id: string
  target_type: string
  target_id: string
  correction_type: string
  original_value: string
  corrected_value: string
  reason: string
}

export interface UserCorrectionDto {
  id: string
  user_id: string
  thread_id: string | null
  target_type: string
  target_id: string | null
  correction_type: string
  original_value: string
  corrected_value: string
  reason: string | null
  system_handling: string | null
  has_conflict: boolean
  created_at: string
  updated_at: string
}

export interface UserCorrectionResultDto {
  correction: UserCorrectionDto
  snapshot?: SnapshotDto | null
  snapshot_updated: boolean
}

export interface PlanItemDto {
  id: string
  item_type: string
  title: string
  time_block: string | null
  estimated_minutes: number | null
  difficulty: number | null
  completion_standard: string | null
  is_optional: boolean
  source: string
  is_user_modified: boolean
  modification_note: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface PlanDto {
  id: string
  root_plan_id: string
  previous_plan_id: string | null
  thread_id: string
  user_id: string
  understanding_session_id: string
  primary_goal_id: string
  version: number
  status: string
  stage: string
  summary: string
  single_action: string
  completion_standard: string
  review_condition: string
  workload: string
  system_recommendation: string
  is_user_final_choice: boolean
  user_final_choice: string | null
  modification_reason: string | null
  expected_impact: string | null
  warning_level: string
  accepted_at: string | null
  created_at: string
  updated_at: string
  items: PlanItemDto[]
}

export interface PlanCreateRequestDto {
  thread_id: string
  understanding_session_id: string
}

export interface PlanReviseRequestDto {
  reason: string
  user_final_choice: string
  expected_impact_acknowledged: boolean
  expected_version: number
}

export interface PlanAcceptRequestDto {
  expected_version: number
}

export interface PlanCreateResultDto {
  plan: PlanDto
  current_step: string
}

export interface PlanReviseResultDto {
  previous_plan: PlanDto
  current_plan: PlanDto
  current_step: string
}

export interface PlanAcceptResultDto {
  plan: PlanDto
  snapshot: SnapshotDto
  current_step: string
}

export interface ActionResultDto {
  id: string
  user_id: string
  thread_id: string
  plan_id: string
  started: boolean
  completed: boolean
  progress_percent: number
  actual_duration_minutes: number | null
  obstacle_code: string
  obstacle_detail: string | null
  energy_change: string | null
  unrealistic_part: string | null
  original_judgment: string
  actual_result_summary: string
  revised_judgment: string
  next_adjustment: string
  submitted_at: string
  created_at: string
  updated_at: string
}

export interface ActionResultCreateDto {
  thread_id: string
  plan_id: string
  started: boolean
  completed: boolean
  progress_percent: number
  actual_duration_minutes: number | null
  obstacle_code: string
  obstacle_detail: string | null
  energy_change: string | null
  unrealistic_part: string | null
}

export interface SystemRevisionDto {
  original_judgment: string
  actual_result: string
  revised_judgment: string
  next_adjustment: string
}

export interface ActionHypothesisDto {
  id: string
  content: string
  category: string
  status: string
  supporting_evidence: Array<Record<string, unknown>>
  opposing_evidence: Array<Record<string, unknown>>
  last_reviewed_at: string | null
  created_at: string
  updated_at: string
}

export interface ActionSubmissionResultDto {
  action_result: ActionResultDto
  system_revision: SystemRevisionDto
  hypothesis: ActionHypothesisDto
  snapshot: SnapshotDto
  current_step: string
}

export interface ThreadAggregateDto {
  thread: ThreadDto
  active_understanding_session: UnderstandingSessionDto | null
  current_answers: AnswerDto[]
  understanding_summary: UnderstandingSummaryDto | null
  recent_corrections: CorrectionDto[]
  current_plan: PlanDto | null
  plan_versions: PlanDto[]
  latest_action_result: ActionResultDto | null
  current_snapshot: SnapshotDto
}
