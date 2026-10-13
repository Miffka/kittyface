# Backend

```sh
uv run uvicorn backend.main:app --reload --port 8091
```

The frontend's `frontend/.env.development` points `VITE_API_BASE_URL` at this port. Set `VITE_USE_MOCK_API=true` to run the frontend without a backend.