from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request, status
from sqlalchemy.orm import Session

from app.api.responses import success
from app.db.session import get_db
from app.schemas.common import Envelope
from app.schemas.plan import (
    PlanAcceptRequest,
    PlanAcceptResult,
    PlanCreateRequest,
    PlanCreateResult,
    PlanReviseRequest,
    PlanReviseResult,
)
from app.services.plan_service import PlanService

router = APIRouter(prefix="/plans", tags=["plans"])
IdempotencyKey = Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=160)]


@router.post("", response_model=Envelope[PlanCreateResult], status_code=status.HTTP_201_CREATED)
def create_plan(
    payload: PlanCreateRequest,
    request: Request,
    idempotency_key: IdempotencyKey,
    session: Annotated[Session, Depends(get_db)],
) -> dict:
    return success(request, PlanService(session).create(payload, idempotency_key))


@router.post("/{plan_id}/revise", response_model=Envelope[PlanReviseResult], status_code=status.HTTP_201_CREATED)
def revise_plan(
    plan_id: str,
    payload: PlanReviseRequest,
    request: Request,
    idempotency_key: IdempotencyKey,
    session: Annotated[Session, Depends(get_db)],
) -> dict:
    return success(request, PlanService(session).revise(plan_id, payload, idempotency_key))


@router.post("/{plan_id}/accept", response_model=Envelope[PlanAcceptResult])
def accept_plan(
    plan_id: str,
    payload: PlanAcceptRequest,
    request: Request,
    idempotency_key: IdempotencyKey,
    session: Annotated[Session, Depends(get_db)],
) -> dict:
    return success(request, PlanService(session).accept(plan_id, payload, idempotency_key))
