import { apiData } from '../api/apiClient'
import { normalizeApiError } from '../api/apiErrors'
import type {
  PlanAcceptResultDto,
  PlanCreateResultDto,
  PlanReviseResultDto,
} from '../api/dto'
import { clearIdempotencyKey, getOrCreateIdempotencyKey } from '../api/idempotency'
import {
  fromPlanAcceptResult,
  fromPlanCreateResult,
  fromPlanReviseResult,
  toPlanAcceptRequest,
  toPlanCreateRequest,
  toPlanReviseRequest,
  type AcceptPlanInput,
  type CreatePlanInput,
  type RevisePlanInput,
} from '../mappers/planMapper'
import type { PlanAcceptResult, PlanCreateResult, PlanReviseResult } from '../types'

async function writeWithIdempotency<TDto, TResult>(
  operation: string,
  path: string,
  payload: unknown,
  map: (dto: TDto) => TResult,
): Promise<TResult> {
  const idempotencyKey = getOrCreateIdempotencyKey(operation, payload)
  try {
    const dto = await apiData<TDto>(path, {
      method: 'POST',
      body: payload,
      idempotencyKey,
    })
    clearIdempotencyKey(operation, idempotencyKey)
    return map(dto)
  } catch (error) {
    const normalized = normalizeApiError(error)
    if (!normalized.retryable) clearIdempotencyKey(operation, idempotencyKey)
    throw normalized
  }
}

export async function createPlan(input: CreatePlanInput): Promise<PlanCreateResult> {
  const payload = toPlanCreateRequest(input)
  return writeWithIdempotency(
    `plan-create-${input.threadId}-${input.understandingSessionId}`,
    '/api/plans',
    payload,
    (dto: PlanCreateResultDto) => fromPlanCreateResult(dto, input.mainGoal),
  )
}

export async function revisePlan(input: RevisePlanInput): Promise<PlanReviseResult> {
  const payload = toPlanReviseRequest(input)
  return writeWithIdempotency(
    `plan-revise-${input.plan.id}-v${input.plan.version}`,
    `/api/plans/${encodeURIComponent(input.plan.id)}/revise`,
    payload,
    (dto: PlanReviseResultDto) => fromPlanReviseResult(dto, input.mainGoal),
  )
}

export async function acceptPlan(input: AcceptPlanInput): Promise<PlanAcceptResult> {
  const payload = toPlanAcceptRequest(input)
  return writeWithIdempotency(
    `plan-accept-${input.plan.id}-v${input.plan.version}`,
    `/api/plans/${encodeURIComponent(input.plan.id)}/accept`,
    payload,
    (dto: PlanAcceptResultDto) => fromPlanAcceptResult(dto, input.mainGoal),
  )
}
