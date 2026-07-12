import hashlib
import json
from typing import Any

from fastapi import status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import APIError
from app.db.seed import DEMO_USER_ID
from app.models.idempotency import IdempotencyRecord


def request_hash(payload: dict[str, Any]) -> str:
    canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


class IdempotencyManager:
    def __init__(self, session: Session, route: str, key: str, payload: dict[str, Any]) -> None:
        self.session = session
        self.route = route
        self.key = key
        self.hash = request_hash(payload)

    def replay(self) -> dict[str, Any] | None:
        record = self.session.scalar(
            select(IdempotencyRecord).where(
                IdempotencyRecord.user_id == DEMO_USER_ID,
                IdempotencyRecord.route == self.route,
                IdempotencyRecord.key == self.key,
            )
        )
        if record is None:
            return None
        if record.request_hash != self.hash:
            raise APIError(
                status.HTTP_409_CONFLICT,
                "DUPLICATE_SUBMISSION",
                "相同 Idempotency-Key 已用于不同请求。",
                {"route": self.route},
            )
        return record.response_data

    def store(self, resource_type: str, resource_id: str, response_data: dict[str, Any]) -> None:
        self.session.add(
            IdempotencyRecord(
                user_id=DEMO_USER_ID,
                route=self.route,
                key=self.key,
                request_hash=self.hash,
                resource_type=resource_type,
                resource_id=resource_id,
                response_data=response_data,
            )
        )
