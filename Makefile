.PHONY: run backend frontend db test docker-build docker-up docker-down

# .env (from .example.env) exports DATABASE_URL to every target.
-include .env

# Both servers in parallel; Ctrl-C stops both.
run:
	$(MAKE) -j2 backend frontend

backend:
	uv run uvicorn backend.main:app --reload --port 8091

frontend:
	cd frontend && bun --bun run dev

# Starts only the compose Postgres, on localhost:5433, for `make backend` and the tests.
db:
	docker compose up -d --wait db

test:
	uv run pytest

# The app image: frontend build plus backend, on http://localhost:8091.
docker-build:
	docker build -t kittyface .

# The app plus Postgres from docker-compose.yaml; the database lives in the kittyface-pg volume.
docker-up:
	docker compose up --build

docker-down:
	docker compose down
