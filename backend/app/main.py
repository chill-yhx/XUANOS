from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.api.routes.health import router as health_router
from app.core.config import get_settings
from app.core.errors import register_error_handlers
from app.engines.provider import get_decision_engines


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    get_decision_engines()
    application = FastAPI(
        title="XUANOS Backend",
        version="0.1.0",
        description="XUANOS MVP persistent decision backend",
        lifespan=lifespan,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @application.middleware("http")
    async def attach_request_id(request: Request, call_next):
        request.state.request_id = request.headers.get("X-Request-ID", f"req_{uuid4().hex}")
        response = await call_next(request)
        response.headers["X-Request-ID"] = request.state.request_id
        return response

    register_error_handlers(application)
    application.include_router(health_router)
    application.include_router(api_router)
    return application


app = create_app()
