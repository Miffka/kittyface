# Backend

```sh
make db   # Postgres from docker-compose.yaml, on localhost:5433
export DATABASE_URL=postgresql+psycopg://kittyface:kittyface@localhost:5433/kittyface
uv run uvicorn backend.main:app --reload --port 8091
```

The frontend's `frontend/.env.development` points `VITE_API_BASE_URL` at this port. Set `VITE_USE_MOCK_API=true` to run the frontend without a backend.
The backend stores data in Postgres through SQLAlchemy and the `psycopg` driver. `DATABASE_URL` names the database as `postgresql+psycopg://user:pass@host:port/db`, and the backend refuses to start without it.

## Migrations

On start, the backend runs the Alembic migrations in `backend/migrations/` up to head, then writes the demo seed. `uv run alembic upgrade head` from the repo root does the same without starting the server. Both read the database from `DATABASE_URL`.

## Tests

`uv run pytest` needs the compose Postgres from `make db`. `tests/backend/conftest.py` creates a throwaway `kittyface_test_<hex>` database on it and drops it when the session ends. Set `TEST_POSTGRES_URL` to use another Postgres server; the tests need a role allowed to create databases.

## Serving the frontend

After `bun --bun run build` in `frontend/`, the backend serves `frontend/.output/public` at `/`, so http://localhost:8091 opens the app. Set `FRONTEND_DIR` to serve a build from another directory. Any path without a matching file gets `_shell.html`, which lets the client router handle `/history/<id>` and other routes on reload. Unknown paths under `/api/` still return 404. Without a build, the backend serves only the API.

## Docker

```sh
make docker-build   # docker build -t kittyface .
make docker-up      # docker compose up --build: the app plus Postgres
make docker-down    # docker compose down
```

The `Dockerfile` builds the frontend in a Node stage, then copies the backend, `models/thresholds.json` and the frontend build into a Python image. The image holds no database: pass `DATABASE_URL`, and it runs the migrations on start.

`docker-compose.yaml` runs the image against a `postgres:17` service and waits for its health check before starting the app, so the app migrates a ready database. Postgres keeps its data in the `kittyface-pg` volume; `docker compose down -v` deletes it. The `db` service publishes port 5433 on the host, so `make backend` and the tests can reach it without colliding with another Postgres on 5432. The credentials (`kittyface`/`kittyface`) are for local use only.
