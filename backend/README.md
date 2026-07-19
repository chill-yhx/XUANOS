# XUANOS Backend

## Setup

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -e ".[dev]"
.\.venv\Scripts\python -m alembic upgrade head
```

## Invite-only authentication

The seed-test account system accepts only mainland China mobile numbers. The
CLI receives an 11-digit number and the backend stores a unique `+86` E.164
value. Administrators never create or inspect user passwords.

```powershell
.\.venv\Scripts\python -m app.cli.users invite --phone 13812345678 --display-name "测试用户1"
.\.venv\Scripts\python -m app.cli.users list
.\.venv\Scripts\python -m app.cli.users disable --phone 13812345678
.\.venv\Scripts\python -m app.cli.users enable --phone 13812345678
.\.venv\Scripts\python -m app.cli.users reset-data --phone 13812345678
```

Local development may use `XUANOS_SMS_PROVIDER=fake`. Fake messages are
written to `data/fake_sms_outbox.jsonl`, which is ignored by Git and must not
be copied into reports. Test runs use an in-memory outbox. Production rejects
the Fake SMS provider.

Both SMS and password login create the same opaque server-side session. The
raw session value is sent only as an `HttpOnly`, `SameSite=Lax` cookie; it is
never returned in JSON. The relevant endpoints are:

```text
POST /api/auth/send-code
POST /api/auth/verify-code
POST /api/auth/login-password
GET  /api/auth/me
POST /api/auth/set-password
POST /api/auth/change-password
POST /api/auth/reset-password
POST /api/auth/logout
```

## Run

```powershell
.\.venv\Scripts\python -m uvicorn app.main:app --reload
```

Swagger: `http://127.0.0.1:8000/docs`

## Core decision flow

The deterministic engine remains the formal baseline. Optional LLM work runs
only in isolated shadow evaluations and never changes a workflow response,
plan, snapshot, hypothesis, or correction.

```text
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

Every core write requires an `Idempotency-Key`. Demo reset is disabled by
default and is available only in explicitly enabled development or test
environments; it resets only the authenticated user's business data.

## Verify

```powershell
.\.venv\Scripts\python -m pytest
.\.venv\Scripts\python -m ruff check .
.\.venv\Scripts\python -m ruff format --check .
.\.venv\Scripts\python -m alembic check
```
