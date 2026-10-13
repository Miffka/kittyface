.PHONY: run backend frontend db

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
