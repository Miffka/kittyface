.PHONY: run backend frontend db docker-build docker-run

# Both servers in parallel; Ctrl-C stops both.
run:
	$(MAKE) -j2 backend frontend

backend:
	uv run uvicorn backend.main:app --reload --port 8091

frontend:
	cd frontend && bun --bun run dev

# Creates the tables and demo seed in $DATABASE_URL (default ./kittyface.db).
db:
	uv run python -c "import backend.main"

# The app image: frontend build plus backend, on http://localhost:8091.
docker-build:
	docker build -t kittyface .

# Keeps the SQLite database in the kittyface-data volume across runs.
docker-run:
	docker run --rm -p 8091:8091 -v kittyface-data:/app/data kittyface
