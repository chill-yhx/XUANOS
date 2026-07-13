from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.api.dependencies import CurrentUser
from app.api.responses import success
from app.db.session import get_db
from app.schemas.common import Envelope
from app.schemas.snapshot import SnapshotRead
from app.services.snapshot_service import SnapshotService

router = APIRouter(prefix="/users", tags=["snapshots"])


@router.get("/me/snapshot", response_model=Envelope[SnapshotRead])
def get_current_snapshot(
    request: Request,
    session: Annotated[Session, Depends(get_db)],
    current_user: CurrentUser,
) -> dict:
    snapshot = SnapshotService(session, current_user.id).get_current()
    return success(request, SnapshotRead.model_validate(snapshot))
