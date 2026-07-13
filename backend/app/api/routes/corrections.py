from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request, status
from sqlalchemy.orm import Session

from app.api.dependencies import CurrentUser
from app.api.responses import success
from app.db.session import get_db
from app.schemas.common import Envelope
from app.schemas.correction import UserCorrectionCreate, UserCorrectionResult
from app.services.correction_service import CorrectionService

router = APIRouter(prefix="/users/me/corrections", tags=["corrections"])
IdempotencyKey = Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=160)]


@router.post("", response_model=Envelope[UserCorrectionResult], status_code=status.HTTP_201_CREATED)
def create_user_correction(
    payload: UserCorrectionCreate,
    request: Request,
    idempotency_key: IdempotencyKey,
    session: Annotated[Session, Depends(get_db)],
    current_user: CurrentUser,
) -> dict:
    return success(request, CorrectionService(session, current_user.id).create(payload, idempotency_key))
