from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app.api.dependencies import CurrentUser
from app.api.responses import success
from app.core.config import Settings, get_settings
from app.core.errors import APIError
from app.db.session import get_db
from app.schemas.common import Envelope
from app.schemas.demo import DemoResetRequest, DemoResetResult
from app.schemas.snapshot import SnapshotRead
from app.services.demo_service import DemoService

router = APIRouter(prefix="/demo", tags=["demo"])


@router.post("/reset", response_model=Envelope[DemoResetResult])
def reset_demo(
    _payload: DemoResetRequest,
    request: Request,
    session: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    current_user: CurrentUser,
) -> dict:
    if settings.app_env not in {"development", "test"} or not settings.demo_reset_enabled:
        raise APIError(status.HTTP_404_NOT_FOUND, "RESOURCE_NOT_FOUND", "资源不存在。")
    snapshot = DemoService(session, current_user.id).reset()
    result = DemoResetResult(
        user_id=current_user.id,
        current_step="idle",
        snapshot=SnapshotRead.model_validate(snapshot),
    )
    return success(request, result)
