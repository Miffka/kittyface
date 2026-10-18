# APP-20: move off SQLite

Groomed from the [APP-20 entry](../backlog.md#app-20-move-off-sqlite). Status: delivered (QA PASS). The `DATABASE_URL` engine switch in `backend/db.py` was already built; this issue added the Postgres driver, Alembic migrations and migrate-on-start.

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
- [x] With no `DATABASE_URL`, the app runs against `kittyface.db` in the working directory exactly as before, and the existing backend tests pass.
- [x] With `DATABASE_URL=postgresql+psycopg://...`, the app runs against Postgres with no code change.
- [x] `psycopg[binary]` is in the runtime dependencies of `pyproject.toml` and in `uv.lock`; `uv sync --no-dev` installs it.
- [x] `backend/migrations/` exists with exactly one revision, and `alembic.ini` at the repo root points at it.
- [x] `uv run alembic upgrade head` from the repo root, against an empty database, creates `consents`, `uploads`, `events`, the index on `uploads.token` and `alembic_version`.
- [x] `backend/main.py` no longer calls `create_all`; importing it upgrades the database to head before the seed rows are written.
- [x] Starting against a fresh Postgres database applies all migrations before the app serves traffic: the first request after start succeeds and the database has `alembic_version` at the baseline revision.
- [x] Restarting against an already-migrated database starts cleanly, applies nothing, and keeps saved uploads.
- [x] A test fails if the migrations and the SQLAlchemy models differ (autogenerate comparison against a freshly migrated database is empty). Adding a column to a model without a migration makes it fail.
- [x] A Postgres test runs when `TEST_POSTGRES_URL` is set and is reported as skipped when it is not.
- [x] QA: against a real Postgres in Docker, `TEST_POSTGRES_URL=... uv run pytest` passes the Postgres test, and the app image started with a Postgres `DATABASE_URL` saves and lists an upload.
- [x] The Docker image runs the migrations on start from any working directory (the image contains `backend/migrations/` and no `alembic.ini`).
- [x] `backend/README.md` documents the Postgres URL scheme, migrate-on-start, and that a database built before this change must be deleted once.
- [x] `backend/AGENTS.md` gives the `alembic revision --autogenerate` command for new migrations.
- [x] No comment in `Dockerfile`, `Makefile` or `backend/main.py` still says APP-20 is pending or that tables are created with `create_all`.
- [x] `docs/DECISIONS.md` and `docs/AI_WORKFLOW.md` each have an APP-20 entry.

**Depends on.** [APP-9](APP-9.md), [APP-11](APP-11.md), [APP-13](APP-13.md), [APP-15](APP-15.md) (the schema the baseline captures). [APP-21](APP-21.md) for the `events` table.

**Out of scope.** Nothing moved out. Decided against, not deferred: an upgrade path for databases built by `create_all` (they get deleted once), and locking against concurrent migrations (the image runs a single uvicorn process).

## Engineer

- `psycopg[binary]` added with `uv add`; `uv export --no-dev` lists it, and the `--no-dev` image connected to Postgres.
- `backend/migrations/` holds `env.py` (runs on `backend.db.engine` with `Base.metadata`, `render_as_batch=True`, no `fileConfig`), `script.py.mako` and one baseline revision, `62b6185e1c34`, for `consents`, `uploads` with `ix_uploads_token`, and `events`. The root `alembic.ini` sets `script_location` and `prepend_sys_path = .`, which the CLI needs to import `backend`.
- `backend/main.py` runs `command.upgrade` on a `Config` built in code with the absolute path to `backend/migrations`, then seeds. `create_all` and its comment are gone.
- `tests/backend/test_migrations.py`: exactly one revision; a second upgrade applies nothing and keeps rows; `compare_metadata` against the migrated database is empty; a model copy with an extra `uploads` column produces a non-empty diff; a Postgres test, skipped without `TEST_POSTGRES_URL`, wipes the `public` schema, saves an upload in one process, lists it in a second, and checks `alembic_version` and the drift diff.
- Results: `uv run pytest` gives 28 passed, 1 skipped. With `TEST_POSTGRES_URL` against `postgres:17`, `uv run pytest tests/backend` gives 18 passed. Uvicorn started twice from `/tmp` against a fresh Postgres database served requests, logged normally, and left `alembic_version` at `62b6185e1c34`. The built image against Postgres saved an upload, listed it, and listed it again after `docker restart`; it contains `backend/migrations/` and no `alembic.ini`.
- Docs: `backend/README.md`, `backend/AGENTS.md`, the `Dockerfile` and `Makefile` comments, `docs/DECISIONS.md`, `docs/AI_WORKFLOW.md`.
- The repo's `kittyface.db` gained an empty `alembic_version` table during an ad-hoc check (see `docs/AI_WORKFLOW.md`). It was a `create_all` database, so it needs the delete-once step anyway.

## QA: PASS

- [x] With no `DATABASE_URL`, the app runs against `kittyface.db` in the working directory exactly as before, and the existing backend tests pass - PASS. Started uvicorn with `DATABASE_URL` unset from an empty temp directory: it created `kittyface.db` there at `62b6185e1c34`, and consent, save and list returned 204, 201, 200. The full suite passes.
- [x] With `DATABASE_URL=postgresql+psycopg://...`, the app runs against Postgres with no code change - PASS. uvicorn and the built image both served consent, save and list against `postgres:17`.
- [x] `psycopg[binary]` is in the runtime dependencies of `pyproject.toml` and in `uv.lock`; `uv sync --no-dev` installs it - PASS. It is in `[project] dependencies` and `uv.lock`; `uv export --no-dev` lists `psycopg==3.3.6` and `psycopg-binary==3.3.6`; `uv sync --no-dev --frozen` into a scratch venv imports `psycopg` 3.3.6 and has no `pytest`.
- [x] `backend/migrations/` exists with exactly one revision, and `alembic.ini` at the repo root points at it - PASS. One file in `versions/` (`62b6185e1c34_baseline.py`, no `down_revision`); `alembic.ini` has `script_location = backend/migrations`.
- [x] `uv run alembic upgrade head` from the repo root, against an empty database, creates `consents`, `uploads`, `events`, the index on `uploads.token` and `alembic_version` - PASS. Against an empty temp SQLite file: exit 0, all four tables plus `ix_uploads_token`, `alembic_version` = `62b6185e1c34`, and `alembic current` reports `(head)`.
- [x] `backend/main.py` no longer calls `create_all`; importing it upgrades the database to head before the seed rows are written - PASS. `command.upgrade(alembic_config, "head")` runs at module level before `store.seed`; no `create_all` in `backend/`. Every fresh start above ended at head with the seed rows present.
- [x] Starting against a fresh Postgres database applies all migrations before the app serves traffic: the first request after start succeeds and the database has `alembic_version` at the baseline revision - PASS. uvicorn from a temp directory against a new database `qa_uv`: the first request succeeded, the save round trip worked, the tables and `ix_uploads_token` exist, and `alembic_version` is `62b6185e1c34`.
- [x] Restarting against an already-migrated database starts cleanly, applies nothing, and keeps saved uploads - PASS. Restarted uvicorn on `qa_uv` with Postgres `log_statement='mod'`: no DDL and no write statements were logged at startup, `alembic_version` stayed `62b6185e1c34`, and the earlier upload was still listed. The image did the same after `docker restart`.
- [x] A test fails if the migrations and the SQLAlchemy models differ. Adding a column to a model without a migration makes it fail - PASS. In a scratch copy of the repo, adding `extra: Mapped[int | None]` to `Event` made `test_migrations_match_models` fail with `('add_column', None, 'events', Column('extra', ...))`. The same column on `Upload` breaks the suite earlier, at collection, because the seed query hits the missing column.
- [x] A Postgres test runs when `TEST_POSTGRES_URL` is set and is reported as skipped when it is not - PASS. Without it: `SKIPPED [1] tests/backend/test_migrations.py:79: TEST_POSTGRES_URL is not set`. With it: `test_postgres_migrate_save_restart PASSED`.
- [x] QA: against a real Postgres in Docker, `TEST_POSTGRES_URL=... uv run pytest` passes the Postgres test, and the app image started with a Postgres `DATABASE_URL` saves and lists an upload - PASS. With `postgres:17`, the Postgres test passed. The `kittyface-qa` image, run with `--network host` against a new database, saved an upload (201) and listed it (200), and still listed it after `docker restart`.
- [x] The Docker image runs the migrations on start from any working directory (the image contains `backend/migrations/` and no `alembic.ini`) - PASS. The image has `/app/backend/migrations/{env.py,script.py.mako,versions/62b6185e1c34_baseline.py}`, and `find /` shows no `alembic.ini`. Run with `-w /tmp` (plus `PYTHONPATH=/app`, which uvicorn needs to import `backend`) against a new Postgres database, it migrated to `62b6185e1c34` and saved an upload.
- [x] `backend/README.md` documents the Postgres URL scheme, migrate-on-start, and that a database built before this change must be deleted once - PASS. It covers all three. Its quoted error is accurate: a `create_all`-built temp database fails on import with `table consents already exists`.
- [x] `backend/AGENTS.md` gives the `alembic revision --autogenerate` command for new migrations - PASS.
- [x] No comment in `Dockerfile`, `Makefile` or `backend/main.py` still says APP-20 is pending or that tables are created with `create_all` - PASS. A grep for `APP-20`, `create_all`, `pending` and `Creates the tables` finds nothing in these files.
- [x] `docs/DECISIONS.md` and `docs/AI_WORKFLOW.md` each have an APP-20 entry - PASS.

Not part of the criteria: `docs/DECISIONS.md` line 21 ("The app calls `create_all` at import") and line 50 ("SQLite lives at `/app/data/kittyface.db` on a volume until APP-20 moves production to Postgres") are older entries that the new APP-20 entry supersedes.

Tests: `uv run pytest`, 28 passed, 1 skipped (the Postgres test), 0 failed. `TEST_POSTGRES_URL=postgresql+psycopg://postgres:pg@localhost:5434/postgres uv run pytest tests/backend` against `postgres:17`, 18 passed, 0 failed. Drift check in a scratch copy with an extra `Event` column: `pytest tests/backend/test_migrations.py`, 1 failed (`test_migrations_match_models`), 3 passed, 1 skipped.
