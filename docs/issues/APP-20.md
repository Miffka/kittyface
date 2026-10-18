# APP-20: move off SQLite

Groomed retrospectively from the [APP-20 entry](../backlog.md#app-20-move-off-sqlite). Status: delivered (partial). Only the engine switch is built.

**Story.** As an operator, I want the backend to pick its database from configuration, so production can use Postgres while local work stays on SQLite.

**Scope.**
- `backend/db.py`: SQLAlchemy engine from `DATABASE_URL`, default `sqlite:///kittyface.db`. The SQLite-only `check_same_thread=False` option is applied only to SQLite URLs.
- Column types are portable (`String`, `JSON`, `LargeBinary`, `Float`).
- `backend/main.py` calls `Base.metadata.create_all` on start. This only adds missing tables.
- `tests/backend/conftest.py` points the suite at a throwaway database through `DATABASE_URL`.

**Acceptance criteria.**
- [x] With no `DATABASE_URL`, the app uses `kittyface.db` in the working directory.
- [x] With `DATABASE_URL` set, the app uses that database (`test_saved_upload_is_in_the_configured_database`).
- [x] Restarting against an existing database starts cleanly and keeps saved uploads.

**Depends on.** [APP-9](APP-9.md), [APP-11](APP-11.md), [APP-13](APP-13.md), [APP-15](APP-15.md).

**Out of scope.** Open in [APP-20 in the backlog](../backlog.md#app-20-move-off-sqlite).
- Alembic migrations. `create_all` cannot change an existing table.
- A Postgres driver in `pyproject.toml`. The README says one must be added first, and nothing has run against Postgres.
- Migrate-on-start.
