from typing import Any

from fastapi import Request

from app.core.errors import request_id


def success(request: Request, data: Any, next_cursor: str | None = None) -> dict[str, Any]:
    return {
        "data": data,
        "meta": {
            "request_id": request_id(request),
            "next_cursor": next_cursor,
        },
    }
