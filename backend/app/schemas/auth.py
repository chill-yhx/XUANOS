from datetime import datetime

from pydantic import BaseModel


class AuthSessionCreateResult(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    expires_at: datetime
