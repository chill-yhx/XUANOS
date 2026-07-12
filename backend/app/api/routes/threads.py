from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, Request, status
from sqlalchemy.orm import Session

from app.api.responses import success
from app.db.session import get_db
from app.schemas.common import Envelope
from app.schemas.thread import ThreadAggregate, ThreadCreate, ThreadRead
from app.services.thread_service import ThreadService

router = APIRouter(prefix="/threads", tags=["threads"])
IdempotencyKey = Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=160)]


@router.post("", response_model=Envelope[ThreadRead], status_code=status.HTTP_201_CREATED)
def create_thread(
    payload: ThreadCreate,
    request: Request,
    idempotency_key: IdempotencyKey,
    session: Annotated[Session, Depends(get_db)],
) -> dict:
    return success(request, ThreadService(session).create(payload, idempotency_key))


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
