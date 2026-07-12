from fastapi import APIRouter

from app.api.routes import demo, snapshots, threads

api_router = APIRouter(prefix="/api")
api_router.include_router(demo.router)
api_router.include_router(threads.router)
api_router.include_router(snapshots.router)
