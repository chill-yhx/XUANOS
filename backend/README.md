# XUANOS Backend

## Setup

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -e ".[dev]"
```

## Database

```powershell
.\.venv\Scripts\alembic upgrade head
```

## Run

```powershell
.\.venv\Scripts\python -m uvicorn app.main:app --reload
```

Swagger: `http://127.0.0.1:8000/docs`

## Core decision flow

The backend owns a complete deterministic, input-driven decision flow. The
provider is selected with `XUANOS_DECISION_ENGINE_PROVIDER=deterministic`; a
future model-backed provider can implement the same engine contracts without
changing the API or persistence workflow:

```text
POST /api/sessions
POST /api/threads
POST /api/understanding/analyze
POST /api/understanding/{session_id}/confirm
POST /api/plans
POST /api/plans/{plan_id}/revise
POST /api/plans/{plan_id}/accept
POST /api/action-results
GET  /api/users/me/snapshot
POST /api/users/me/corrections
```

`POST /api/sessions` issues an opaque bearer token. All remaining `/api` workflow endpoints require `Authorization: Bearer <token>` and scope data to that server-issued user.

Every core write requires an `Idempotency-Key` header. The same key and payload replay the first response; reusing a key with a different payload returns `409 DUPLICATE_SUBMISSION`.

Demo reset is disabled by default. It is available only when both `XUANOS_APP_ENV=development` and `XUANOS_DEMO_RESET_ENABLED=true`, and it resets only the authenticated user's data.

## Verify

```powershell
.\.venv\Scripts\python -m pytest
.\.venv\Scripts\python -m ruff check .
```
