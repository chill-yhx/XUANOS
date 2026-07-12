from typing import Annotated

from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.session import get_db

router = APIRouter(tags=["health"])


@router.get("/health", response_model=None)
def health_check(session: Annotated[Session, Depends(get_db)]) -> dict[str, str] | JSONResponse:
    try:
        session.execute(text("SELECT 1"))
    except SQLAlchemyError:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "error", "service": "xuanos-backend", "database": "unavailable", "version": "0.1.0"},
        )
    return {"status": "ok", "service": "xuanos-backend", "database": "ok", "version": "0.1.0"}
