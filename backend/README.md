# Backend

```sh
uv run uvicorn backend.main:app --reload --port 8091
```

The frontend's `frontend/.env.development` points `VITE_API_BASE_URL` at this port. Set `VITE_USE_MOCK_API=true` to run the frontend without a backend.
The backend stores data through SQLAlchemy. Set `DATABASE_URL` to pick the database; without it, the server creates `kittyface.db` in the directory you start it from. For Postgres, set `DATABASE_URL=postgresql+psycopg://user:pass@host/db`; the `psycopg` driver is a runtime dependency.

## Migrations

On start, the backend runs the Alembic migrations in `backend/migrations/` up to head, then writes the demo seed. `uv run alembic upgrade head` from the repo root does the same without starting the server. Both read the database from `DATABASE_URL`.

A database created before migrations existed (by `create_all`) has the tables but no `alembic_version`, so the app fails on start with "table consents already exists". Delete it once and let the app recreate it: `rm kittyface.db` locally, `docker volume rm kittyface-data` for Docker.

## Serving the frontend

After `bun --bun run build` in `frontend/`, the backend serves `frontend/.output/public` at `/`, so http://localhost:8091 opens the app. Set `FRONTEND_DIR` to serve a build from another directory. Any path without a matching file gets `_shell.html`, which lets the client router handle `/history/<id>` and other routes on reload. Unknown paths under `/api/` still return 404. Without a build, the backend serves only the API.

## Docker

```sh
make docker-build   # docker build -t kittyface .
make docker-run     # docker run --rm -p 8091:8091 -v kittyface-data:/app/data kittyface
```

The `Dockerfile` builds the frontend in a Node stage, then copies the backend, `models/thresholds.json` and the frontend build into a Python image. The image keeps its SQLite database at `/app/data/kittyface.db`; mount a volume there to keep data across containers, or set `DATABASE_URL` to a Postgres URL. The image runs the migrations on start.
