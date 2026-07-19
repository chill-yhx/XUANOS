from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from app.api.dependencies import CurrentAuthSession, CurrentUser
from app.api.responses import success
from app.core.config import get_settings
from app.db.session import get_db
from app.schemas.auth import (
    AuthOperationResult,
    AuthSessionResult,
    ChangePasswordRequest,
    PasswordLoginRequest,
    ResetPasswordRequest,
    SendCodeRequest,
    SendCodeResult,
    SetPasswordRequest,
    VerifyCodeRequest,
)
from app.schemas.common import Envelope
from app.services.auth_service import AuthService, IssuedSession

router = APIRouter(prefix="/auth", tags=["auth"])


def _request_ip(request: Request) -> str:
    return request.client.host if request.client is not None else "unknown"


def _set_session_cookie(response: Response, issued: IssuedSession) -> None:
    settings = get_settings()
    max_age = max(0, int((issued.result.expires_at - datetime.now(UTC)).total_seconds()))
    response.set_cookie(
        key=settings.session_cookie_name,
        value=issued.raw_token,
        max_age=max_age,
        expires=issued.result.expires_at,
        path="/",
        secure=settings.app_env == "production",
        httponly=True,
        samesite="lax",
    )


def _clear_session_cookie(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        settings.session_cookie_name,
        path="/",
        secure=settings.app_env == "production",
        httponly=True,
        samesite="lax",
    )


@router.post("/send-code", response_model=Envelope[SendCodeResult])
def send_code(
    payload: SendCodeRequest,
    request: Request,
    session: Annotated[Session, Depends(get_db)],
) -> dict:
    result = AuthService(session, _request_ip(request)).send_code(payload.phone, payload.purpose)
    return success(request, result)


@router.post("/verify-code", response_model=Envelope[AuthSessionResult])
def verify_code(
    payload: VerifyCodeRequest,
    request: Request,
    response: Response,
    session: Annotated[Session, Depends(get_db)],
) -> dict:
    issued = AuthService(session, _request_ip(request)).verify_login_code(payload.phone, payload.code)
    _set_session_cookie(response, issued)
    return success(request, issued.result)


@router.post("/login-password", response_model=Envelope[AuthSessionResult])
def login_password(
    payload: PasswordLoginRequest,
    request: Request,
    response: Response,
    session: Annotated[Session, Depends(get_db)],
) -> dict:
    issued = AuthService(session, _request_ip(request)).login_password(payload.phone, payload.password)
    _set_session_cookie(response, issued)
    return success(request, issued.result)


@router.get("/me", response_model=Envelope[AuthSessionResult])
def get_me(
    request: Request,
    current_user: CurrentUser,
    current_session: CurrentAuthSession,
    session: Annotated[Session, Depends(get_db)],
) -> dict:
    result = AuthService(session, _request_ip(request)).current_session_result(current_user, current_session)
    return success(request, result)


@router.post("/set-password", response_model=Envelope[AuthSessionResult])
def set_password(
    payload: SetPasswordRequest,
    request: Request,
    current_user: CurrentUser,
    current_session: CurrentAuthSession,
    session: Annotated[Session, Depends(get_db)],
) -> dict:
    result = AuthService(session, _request_ip(request)).set_password(
        current_user, current_session, payload.new_password
    )
    return success(request, result)


@router.post("/change-password", response_model=Envelope[AuthSessionResult])
def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    current_user: CurrentUser,
    current_session: CurrentAuthSession,
    session: Annotated[Session, Depends(get_db)],
) -> dict:
    result = AuthService(session, _request_ip(request)).change_password(
        current_user,
        current_session,
        payload.current_password,
        payload.new_password,
    )
    return success(request, result)


@router.post("/reset-password", response_model=Envelope[AuthOperationResult])
def reset_password(
    payload: ResetPasswordRequest,
    request: Request,
    response: Response,
    session: Annotated[Session, Depends(get_db)],
) -> dict:
    result = AuthService(session, _request_ip(request)).reset_password(
        payload.phone,
        payload.code,
        payload.new_password,
    )
    _clear_session_cookie(response)
    return success(request, result)


@router.post("/logout", response_model=Envelope[AuthOperationResult])
def logout(
    request: Request,
    response: Response,
    current_session: CurrentAuthSession,
    session: Annotated[Session, Depends(get_db)],
) -> dict:
    result = AuthService(session, _request_ip(request)).logout(current_session)
    _clear_session_cookie(response)
    return success(request, result)
