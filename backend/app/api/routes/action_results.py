from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request, status
from sqlalchemy.orm import Session

from app.api.dependencies import CurrentUser
from app.api.responses import success
from app.db.session import get_db
from app.schemas.action_result import ActionResultCreate, ActionSubmissionResult
from app.schemas.common import Envelope
from app.services.action_service import ActionService

router = APIRouter(prefix="/action-results", tags=["action-results"])
IdempotencyKey = Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=160)]


@router.post("", response_model=Envelope[ActionSubmissionResult], status_code=status.HTTP_201_CREATED)
def submit_action_result(
    payload: ActionResultCreate,
    request: Request,
    idempotency_key: IdempotencyKey,
    session: Annotated[Session, Depends(get_db)],
    current_user: CurrentUser,
) -> dict:
    return success(request, ActionService(session, current_user.id).submit(payload, idempotency_key))
