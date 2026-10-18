import os
import secrets
import tempfile
from pathlib import Path

from sqlalchemy import create_engine, make_url, text

# The server DATABASE_URL names (from .env); TEST_POSTGRES_URL points at another one.
SERVER = make_url(os.environ.get("TEST_POSTGRES_URL") or os.environ["DATABASE_URL"])
TEST_DB = f"kittyface_test_{secrets.token_hex(4)}"
# AUTOCOMMIT: Postgres refuses CREATE/DROP DATABASE inside a transaction.
admin = create_engine(SERVER, isolation_level="AUTOCOMMIT")
with admin.connect() as conn:
    conn.execute(text(f"CREATE DATABASE {TEST_DB}"))
# Must run before backend.db is imported, so tests never touch a real database.
os.environ["DATABASE_URL"] = SERVER.set(database=TEST_DB).render_as_string(
    hide_password=False
)


# A stand-in frontend build, so the SPA fallback is testable without bun.
frontend = Path(tempfile.mkdtemp())
(frontend / "assets").mkdir()
(frontend / "_shell.html").write_text("<html>shell</html>")
(frontend / "assets" / "app.js").write_text("console.log(1)")
os.environ["FRONTEND_DIR"] = str(frontend)


def pytest_sessionfinish():
    with admin.connect() as conn:
        conn.execute(text(f"DROP DATABASE {TEST_DB} WITH (FORCE)"))
