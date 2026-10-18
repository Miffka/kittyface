## Commands

Run from the repo root.

- `uv sync` installs runtime and dev dependencies.
- `uv sync --group train --group dev` adds the research track's dependencies.
- `uv run pytest` runs the whole suite.
- `uv run pytest tests/backend/test_api.py` runs one test file.
- `uv run uvicorn backend.main:app --reload --port 8091` starts the API.
- `uv run python scripts/<script>.py` runs a research track script.
- `docker build -t kittyface .` builds the app image; `docker run -p 8091:8091 -v kittyface-data:/app/data kittyface` runs it.

## Rules

- Add dependencies in the root `pyproject.toml`. Ask before adding one.
- `DATABASE_URL` selects the database. It defaults to `sqlite:///kittyface.db`.
- `FRONTEND_DIR` selects the frontend build the backend serves at `/`. It defaults to `frontend/.output/public`; the backend skips the mount when the directory is missing.

## Documents

- [backend/README.md](README.md) covers running the backend and configuring the database.
