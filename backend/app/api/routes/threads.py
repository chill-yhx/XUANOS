from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from app.api.responses import success
from app.db.session import get_db
from app.schemas.common import Envelope
from app.schemas.thread import ThreadAggregate, ThreadCreate, ThreadRead
from app.services.thread_service import ThreadService

router = APIRouter(prefix="/threads", tags=["threads"])


@router.post("", response_model=Envelope[ThreadRead], status_code=status.HTTP_201_CREATED)
def create_thread(payload: ThreadCreate, request: Request, session: Annotated[Session, Depends(get_db)]) -> dict:
    thread = ThreadService(session).create(payload)
    return success(request, ThreadRead.model_validate(thread))


@router.get("", response_model=Envelope[list[ThreadRead]])
def list_threads(
    request: Request,
    session: Annotated[Session, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    thread_status: Annotated[str | None, Query(alias="status")] = None,
) -> dict:
    threads = ThreadService(session).list(limit, thread_status)
    return success(request, [ThreadRead.model_validate(thread) for thread in threads])


@router.get("/{thread_id}", response_model=Envelope[ThreadAggregate])
def get_thread(thread_id: str, request: Request, session: Annotated[Session, Depends(get_db)]) -> dict:
    aggregate = ThreadService(session).get_aggregate(thread_id)
    return success(request, aggregate)
