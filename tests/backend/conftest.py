import os
import secrets
import tempfile
from pathlib import Path

from sqlalchemy import create_engine, make_url, text

# The compose Postgres from `make db`; TEST_POSTGRES_URL points at another server.
SERVER = make_url(
    os.environ.get(
        "TEST_POSTGRES_URL",
        "postgresql+psycopg://kittyface:kittyface@localhost:5433/kittyface",
    )
)
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
