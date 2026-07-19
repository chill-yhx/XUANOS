from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

SmsPurpose = Literal["login", "reset_password"]


class SendCodeRequest(BaseModel):
    phone: str = Field(min_length=1, max_length=32)
    purpose: SmsPurpose


class SendCodeResult(BaseModel):
    accepted: bool = True
    retry_after_seconds: int
    message: str


class VerifyCodeRequest(BaseModel):
    phone: str = Field(min_length=1, max_length=32)
    code: str = Field(pattern=r"^\d{6}$")


class PasswordLoginRequest(BaseModel):
    phone: str = Field(min_length=1, max_length=32)
    password: str = Field(min_length=1, max_length=256)


class SetPasswordRequest(BaseModel):
    new_password: str = Field(min_length=1, max_length=256)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=1, max_length=256)


class ResetPasswordRequest(BaseModel):
    phone: str = Field(min_length=1, max_length=32)
    code: str = Field(pattern=r"^\d{6}$")
    new_password: str = Field(min_length=1, max_length=256)


class AuthUserResult(BaseModel):
    id: str
    phone_masked: str
    display_name: str | None
    status: str
    phone_verified: bool
    has_password: bool


class AuthSessionResult(BaseModel):
    user: AuthUserResult
    expires_at: datetime
    needs_password_setup: bool


class AuthOperationResult(BaseModel):
    completed: bool = True
    message: str
