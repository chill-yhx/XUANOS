# ruff: noqa: E402, I001

import os
import tempfile
from collections.abc import Generator
from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
TEST_DB_PATH = Path(tempfile.gettempdir()) / f"xuanos-test-{uuid4().hex}.db"
os.environ["XUANOS_DATABASE_URL"] = f"sqlite:///{TEST_DB_PATH.as_posix()}"
os.environ["XUANOS_APP_ENV"] = "development"
os.environ["XUANOS_DEMO_RESET_ENABLED"] = "true"

from app.db.base import Base  # noqa: E402
from app.db.session import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def migrated_database() -> Generator[None, None, None]:
    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    command.upgrade(config, "head")
    yield
    engine.dispose()
    TEST_DB_PATH.unlink(missing_ok=True)


@pytest.fixture(autouse=True)
def clean_database(migrated_database: None) -> None:
    with SessionLocal() as session:
        for table in reversed(Base.metadata.sorted_tables):
            session.execute(table.delete())
        session.commit()


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    with TestClient(app) as test_client:
        created = test_client.post("/api/sessions")
        assert created.status_code == 201
        identity = created.json()["data"]
        test_client.headers.update({"Authorization": f"Bearer {identity['access_token']}"})
        test_client.user_id = identity["user_id"]  # type: ignore[attr-defined]
        yield test_client
