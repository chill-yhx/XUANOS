from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app.api.responses import success
from app.db.session import get_db
from app.schemas.auth import AuthSessionCreateResult
from app.schemas.common import Envelope
from app.services.auth_service import AuthService

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("", response_model=Envelope[AuthSessionCreateResult], status_code=status.HTTP_201_CREATED)
def create_session(request: Request, session: Annotated[Session, Depends(get_db)]) -> dict:
    return success(request, AuthService(session).create_session())
