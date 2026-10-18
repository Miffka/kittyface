import os
import subprocess
import sys

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import Column, Integer, MetaData

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
    return subprocess.run(
        [sys.executable, "-c", code, *args],
        env=os.environ | {"FRONTEND_DIR": "/nonexistent"},
        capture_output=True,
        text=True,
        check=True,
    ).stdout.split()


def test_restart_keeps_saved_upload():
    token, upload_id = run_app(SAVE)
    assert run_app(LIST, token) == [upload_id]
