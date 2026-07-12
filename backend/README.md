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

## Core mock flow

The second backend batch owns the complete deterministic flow:

```text
POST /api/understanding/analyze
POST /api/understanding/{session_id}/confirm
POST /api/plans
POST /api/plans/{plan_id}/revise
POST /api/plans/{plan_id}/accept
POST /api/action-results
```

Every core write requires an `Idempotency-Key` header. The same key and payload replay the first response; reusing a key with a different payload returns `409 DUPLICATE_SUBMISSION`.

## Verify

```powershell
.\.venv\Scripts\python -m pytest
.\.venv\Scripts\python -m ruff check .
```
