# APP-20: move off SQLite

Groomed from the [APP-20 entry](../backlog.md#app-20-move-off-sqlite). Status: open (re-groomed). The `DATABASE_URL` engine switch in `backend/db.py` is already built; this issue adds the Postgres driver, Alembic migrations and migrate-on-start.

**Story.** As an operator, I want the backend to run against Postgres in production while staying on SQLite locally, with migrations applied automatically on start, so the app is ready to deploy.

**Scope.**
- Already built: `backend/db.py` builds the engine from `DATABASE_URL`, default `sqlite:///kittyface.db`, and applies `check_same_thread=False` only to SQLite URLs. Column types are portable (`String`, `JSON`, `LargeBinary`, `Float`). `tests/backend/conftest.py` points the suite at a throwaway SQLite database through `DATABASE_URL`.
- `pyproject.toml` and `uv.lock`: add `psycopg[binary]` as a runtime dependency. Postgres URLs use the `postgresql+psycopg://` scheme. `alembic` is already a locked dependency.
- `backend/migrations/`: the Alembic environment (`env.py`, `script.py.mako`, `versions/`). It lives inside `backend/` so the Dockerfile's `COPY backend backend` ships it. `env.py` takes the URL from `backend.db.DATABASE_URL` and uses `backend.db.Base.metadata` as `target_metadata`.
- One baseline revision in `backend/migrations/versions/` that creates the current three tables exactly as `backend/db.py` defines them: `consents`, `uploads` (with its index on `token`) and `events`.
- A root `alembic.ini` with `script_location = backend/migrations`, so `uv run alembic ...` works from the repo root. It holds no database URL; the URL always comes from `DATABASE_URL`.
- `backend/main.py`: replace `Base.metadata.create_all(engine)` with `alembic upgrade head`, run in code through `alembic.command.upgrade` with a `Config` built in code (script location set to `backend/migrations` by absolute path, so it works from any working directory and inside the image, where `alembic.ini` is not copied). It runs at import, before `store.seed(session)` and before the app serves traffic.
- Old databases that `create_all` built have the tables but no `alembic_version` table, so the baseline would fail on them. No code handles this: delete such a database once (`kittyface.db` locally, the `kittyface-data` volume for Docker) and let the app recreate it. The README says so.
- Tests: a drift test that compares the migrated schema with `Base.metadata` (Alembic's `compare_metadata` on a freshly upgraded database) and fails on any difference. A Postgres test that runs the upgrade and the API round trip against `TEST_POSTGRES_URL` when it is set, and is skipped otherwise.
- Docs: `backend/README.md` (Postgres URL, migrations on start, the delete-once note for old databases), `backend/AGENTS.md` (how to add a migration: `uv run alembic revision --autogenerate -m "<message>"`, then review it), the `APP-20` comments in `Dockerfile` and `backend/main.py`, the `Makefile` `db` comment (it says "Creates the tables"; it now runs migrations), a `docs/DECISIONS.md` entry (Alembic with migrate-on-start, psycopg, no upgrade path for `create_all` databases) and a `docs/AI_WORKFLOW.md` entry.

**Acceptance criteria.**
- [ ] With no `DATABASE_URL`, the app runs against `kittyface.db` in the working directory exactly as before, and the existing backend tests pass.
- [ ] With `DATABASE_URL=postgresql+psycopg://...`, the app runs against Postgres with no code change.
- [ ] `psycopg[binary]` is in the runtime dependencies of `pyproject.toml` and in `uv.lock`; `uv sync --no-dev` installs it.
- [ ] `backend/migrations/` exists with exactly one revision, and `alembic.ini` at the repo root points at it.
- [ ] `uv run alembic upgrade head` from the repo root, against an empty database, creates `consents`, `uploads`, `events`, the index on `uploads.token` and `alembic_version`.
- [ ] `backend/main.py` no longer calls `create_all`; importing it upgrades the database to head before the seed rows are written.
- [ ] Starting against a fresh Postgres database applies all migrations before the app serves traffic: the first request after start succeeds and the database has `alembic_version` at the baseline revision.
- [ ] Restarting against an already-migrated database starts cleanly, applies nothing, and keeps saved uploads.
- [ ] A test fails if the migrations and the SQLAlchemy models differ (autogenerate comparison against a freshly migrated database is empty). Adding a column to a model without a migration makes it fail.
- [ ] A Postgres test runs when `TEST_POSTGRES_URL` is set and is reported as skipped when it is not.
- [ ] QA: against a real Postgres in Docker, `TEST_POSTGRES_URL=... uv run pytest` passes the Postgres test, and the app image started with a Postgres `DATABASE_URL` saves and lists an upload.
- [ ] The Docker image runs the migrations on start from any working directory (the image contains `backend/migrations/` and no `alembic.ini`).
- [ ] `backend/README.md` documents the Postgres URL scheme, migrate-on-start, and that a database built before this change must be deleted once.
- [ ] `backend/AGENTS.md` gives the `alembic revision --autogenerate` command for new migrations.
- [ ] No comment in `Dockerfile`, `Makefile` or `backend/main.py` still says APP-20 is pending or that tables are created with `create_all`.
- [ ] `docs/DECISIONS.md` and `docs/AI_WORKFLOW.md` each have an APP-20 entry.

**Depends on.** [APP-9](APP-9.md), [APP-11](APP-11.md), [APP-13](APP-13.md), [APP-15](APP-15.md) (the schema the baseline captures). [APP-21](APP-21.md) for the `events` table.

**Out of scope.** Nothing moved out. Decided against, not deferred: an upgrade path for databases built by `create_all` (they get deleted once), and locking against concurrent migrations (the image runs a single uvicorn process).
