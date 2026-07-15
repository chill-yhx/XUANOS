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
formal baseline always remains deterministic. An optional OpenAI-compatible
LLM can run only in shadow mode, producing a separately stored candidate and
evaluation record; it never changes a workflow response, plan, snapshot, or
hypothesis.

```text
XUANOS_DECISION_ENGINE_PROVIDER=deterministic   # baseline only
XUANOS_LLM_SHADOW_ENABLED=false                 # no provider call by default
```

To enable a real shadow transport, set
`XUANOS_DECISION_ENGINE_PROVIDER=openai_compatible` plus
`XUANOS_LLM_MODEL`, `XUANOS_LLM_API_KEY`, `XUANOS_LLM_BASE_URL`, and an
optional `XUANOS_LLM_TIMEOUT_SECONDS`. Keep the key in local environment
configuration only; never commit it.

For a real local shadow run, create `backend/.env` from `.env.example` and set:

```text
XUANOS_DECISION_ENGINE_PROVIDER=openai_compatible
XUANOS_LLM_SHADOW_ENABLED=true
XUANOS_LLM_MODEL=<provider model name>
XUANOS_LLM_BASE_URL=<OpenAI-compatible base URL ending in /v1>
XUANOS_LLM_API_KEY=<local secret>
XUANOS_LLM_TIMEOUT_SECONDS=15
```

`backend/.env` is ignored by Git. Never paste the key into source, reports, logs,
test fixtures, or chat. The formal baseline remains deterministic even when
shadow mode is enabled.

Run one or all isolated semantic cases from the repository root:

```powershell
python backend/scripts/run_shadow_evaluation.py --case ielts
python backend/scripts/run_shadow_evaluation.py --all
python backend/scripts/run_shadow_evaluation.py --all --output reports/shadow-evaluation.json
```

Each run uses a temporary migrated SQLite database, creates a new server-issued
user session and thread per case, and writes companion JSON and Markdown reports.

The formal workflow remains:

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
