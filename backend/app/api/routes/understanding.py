from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy.orm import Session

from app.api.dependencies import CurrentUser
from app.api.responses import success
from app.db.session import get_db
from app.schemas.common import Envelope
from app.schemas.understanding import (
    UnderstandingAnalyzeRequest,
    UnderstandingAnalyzeResult,
    UnderstandingConfirmRequest,
    UnderstandingConfirmResult,
)
from app.services.understanding_service import UnderstandingService

router = APIRouter(prefix="/understanding", tags=["understanding"])
IdempotencyKey = Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=160)]


@router.post("/analyze", response_model=Envelope[UnderstandingAnalyzeResult])
def analyze_understanding(
    payload: UnderstandingAnalyzeRequest,
    request: Request,
    idempotency_key: IdempotencyKey,
    session: Annotated[Session, Depends(get_db)],
    current_user: CurrentUser,
) -> dict:
    return success(request, UnderstandingService(session, current_user.id).analyze(payload, idempotency_key))


@router.post("/{session_id}/confirm", response_model=Envelope[UnderstandingConfirmResult])
def confirm_understanding(
    session_id: str,
    payload: UnderstandingConfirmRequest,
    request: Request,
    idempotency_key: IdempotencyKey,
    session: Annotated[Session, Depends(get_db)],
    current_user: CurrentUser,
) -> dict:
    return success(
        request,
        UnderstandingService(session, current_user.id).confirm(session_id, payload, idempotency_key),
    )
