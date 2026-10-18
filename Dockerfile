# Node builds the frontend; bun only installs it, so bun.lock and bunfig.toml's release-age guard apply.
FROM node:22-slim AS frontend
RUN npm install -g bun@1.4.3
WORKDIR /app/frontend
COPY frontend/package.json frontend/bun.lock frontend/bunfig.toml ./
RUN bun install --frozen-lockfile
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.11.15 /uv /bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY backend backend
COPY models/thresholds.json models/
COPY --from=frontend /app/frontend/.output/public frontend/.output/public
# Needs DATABASE_URL, a postgresql+psycopg:// URL; backend.main runs the migrations on start.
EXPOSE 8091
CMD ["/app/.venv/bin/uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8091"]
