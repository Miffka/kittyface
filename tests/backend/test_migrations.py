import os
import subprocess
import sys

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import Column, Integer, MetaData, create_engine, text

from backend.db import Base, Consent, SessionLocal, engine
from backend.main import alembic_config

HEAD = ScriptDirectory.from_config(alembic_config).get_current_head()


def test_one_baseline_revision():
    revisions = list(ScriptDirectory.from_config(alembic_config).walk_revisions())
    assert [r.revision for r in revisions] == [HEAD]


def test_upgrade_again_applies_nothing_and_keeps_rows():
    with SessionLocal() as session:
        session.merge(Consent(token="upgrade-twice", notice_version="v"))
        session.commit()
    command.upgrade(alembic_config, "head")
    with SessionLocal() as session:
        assert session.get(Consent, "upgrade-twice")
    with engine.connect() as conn:
        assert MigrationContext.configure(conn).get_current_heads() == (HEAD,)


def diff(conn, metadata=Base.metadata):
    return compare_metadata(MigrationContext.configure(conn), metadata)


def test_migrations_match_models():
    with engine.connect() as conn:
        assert diff(conn) == []


def test_drift_check_sees_a_model_change():
    changed = MetaData()
    for table in Base.metadata.tables.values():
        table.to_metadata(changed)
    changed.tables["uploads"].append_column(Column("extra", Integer))
    with engine.connect() as conn:
        assert diff(conn, changed)


PG_URL = os.environ.get("TEST_POSTGRES_URL")

SAVE = """
from tests.backend.test_api import consented_token, save
token = consented_token()
print(token, save(token).json()["id"])
"""
LIST = """
import sys
from tests.backend.test_api import client, headers
listed = client.get("/api/v1/uploads", headers=headers(sys.argv[1])).json()
print(" ".join(u["id"] for u in listed))
"""


def run_app(code, *args):
    # backend.db binds DATABASE_URL at import, so each start is its own process.
    env = os.environ | {"DATABASE_URL": PG_URL, "FRONTEND_DIR": "/nonexistent"}
    return subprocess.run(
        [sys.executable, "-c", code, *args],
        env=env,
        capture_output=True,
        text=True,
        check=True,
    ).stdout.split()


@pytest.mark.skipif(not PG_URL, reason="TEST_POSTGRES_URL is not set")
def test_postgres_migrate_save_restart():
    # Wipes the database's public schema: point TEST_POSTGRES_URL at a scratch one.
    pg = create_engine(PG_URL)
    with pg.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public"))

    token, upload_id = run_app(SAVE)  # first start migrates an empty database
    assert run_app(LIST, token) == [upload_id]  # restart keeps the upload

    with pg.connect() as conn:
        version = conn.execute(text("SELECT version_num FROM alembic_version"))
        assert version.scalars().all() == [HEAD]
        assert diff(conn) == []
