## Commands

Run from the repo root.

- `uv sync` installs runtime and dev dependencies.
- `uv sync --group train --group dev` adds the research track's dependencies.
- `uv run pytest` runs the whole suite.
- `uv run pytest tests/backend/test_api.py` runs one test file.
- `uv run uvicorn backend.main:app --reload --port 8091` starts the API.
- `uv run python scripts/<script>.py` runs a research track script.
- `uv run alembic revision --autogenerate -m "<message>"` writes a migration in `backend/migrations/versions/` from the model changes in `backend/db.py`. Review it by hand before committing; `tests/backend/test_migrations.py` fails while models and migrations differ.
- `make docker-build` builds the app image; `make docker-run` runs it on port 8091 with the database in the `kittyface-data` volume.

## Rules

- Add dependencies in the root `pyproject.toml`. Ask before adding one.
- `DATABASE_URL` selects the database. It defaults to `sqlite:///kittyface.db`. Postgres URLs use `postgresql+psycopg://`. The app migrates the database to head on start.
- `FRONTEND_DIR` selects the frontend build the backend serves at `/`. It defaults to `frontend/.output/public`; the backend skips the mount when the directory is missing.

## Documents

- [backend/README.md](README.md) covers running the backend and configuring the database.
