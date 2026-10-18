## Commands

Run from the repo root.

- `uv sync` installs runtime and dev dependencies.
- `uv sync --group train --group dev` adds the research track's dependencies.
- `cp .example.env .env` and set a real password before anything else. `make` targets read `.env`; outside `make`, `source .env`.
- `make db` starts the compose Postgres on localhost:5433. The backend and the tests need it.
- `make test` (or `uv run pytest` after `source .env`) runs every suite except `tests/e2e`.
- `make test-e2e` builds the image, starts the compose stack as project `kittyface-e2e` on port 18091 with its own volume, drives it in Chromium, and removes the stack and volume afterwards. Run `uv run playwright install chromium` once first.
- `uv run python scripts/05_score_image.py tests/e2e/fixtures/cats --out /tmp/overlays --json tests/e2e/expected.json` regenerates the Python predictions the E2E tests compare against. Rerun it after changing the models, the thresholds or `tests/e2e/fixtures/cats`.
- `uv run pytest tests/backend/test_api.py` runs one test file.
- `uv run uvicorn backend.main:app --reload --port 8091` starts the API.
- `uv run python scripts/<script>.py` runs a research track script.
- `uv run alembic revision --autogenerate -m "<message>"` writes a migration in `backend/migrations/versions/` from the model changes in `backend/db.py`. Review it by hand before committing; `tests/backend/test_migrations.py` fails while models and migrations differ.
- `make docker-build` builds the app image.
- `make docker-up` runs the app image against Postgres from `docker-compose.yaml` on port 8091; `make docker-down` stops it.

## Rules

- Add dependencies in the root `pyproject.toml`. Ask before adding one.
- `DATABASE_URL` is required and names a Postgres database as `postgresql+psycopg://...`. `.env` builds it from `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB`. The app migrates the database to head on start.
- `.env` is gitignored and dockerignored. Never commit it or print its values; `.example.env` is the committed template.
- Postgres only, no SQLite. Tests run against Postgres too.
- `FRONTEND_DIR` selects the frontend build the backend serves at `/`. It defaults to `frontend/.output/public`; the backend skips the mount when the directory is missing.

## Documents

- [backend/README.md](README.md) covers running the backend and configuring the database.
