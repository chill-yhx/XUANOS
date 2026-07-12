from fastapi import APIRouter

from app.api.routes import action_results, corrections, demo, plans, snapshots, threads, understanding

api_router = APIRouter(prefix="/api")
api_router.include_router(demo.router)
api_router.include_router(threads.router)
api_router.include_router(snapshots.router)
api_router.include_router(corrections.router)
api_router.include_router(understanding.router)
api_router.include_router(plans.router)
api_router.include_router(action_results.router)
