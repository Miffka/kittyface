# Backend

```sh
uv run uvicorn backend.main:app --reload --port 8091
```

The frontend's `frontend/.env.development` points `VITE_API_BASE_URL` at this port. Set `VITE_USE_MOCK_API=true` to run the frontend without a backend.
The backend stores data through SQLAlchemy. Set `DATABASE_URL` to pick the database; without it, the server creates `kittyface.db` in the directory you start it from. Tables get created on start. Postgres needs a driver dependency first, then `DATABASE_URL=postgresql+psycopg://user:pass@host/db`.
