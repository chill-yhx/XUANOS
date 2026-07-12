from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

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
) -> dict:
    if not settings.demo_reset_enabled:
        raise APIError(status.HTTP_404_NOT_FOUND, "RESOURCE_NOT_FOUND", "资源不存在。")
    snapshot = DemoService(session).reset()
    result = DemoResetResult(user_id="demo-user", current_step="idle", snapshot=SnapshotRead.model_validate(snapshot))
    return success(request, result)
