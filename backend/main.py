import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException

from backend import store
from backend.db import Base, SessionLocal, engine
from backend.routers import router

# ponytail: create_all only adds missing tables; APP-20 brings Alembic migrations.
Base.metadata.create_all(engine)
with SessionLocal() as session:
    store.seed(session)

FRONTEND_DIR = Path(
    os.environ.get(
        "FRONTEND_DIR",
        Path(__file__).resolve().parents[1] / "frontend" / ".output" / "public",
    )
)


class SPAFiles(StaticFiles):
    """Serves the frontend build; unknown non-API paths get the SPA shell."""

    async def get_response(self, path, scope):
        try:
            return await super().get_response(path, scope)
        except HTTPException as e:
            if e.status_code != 404 or path.startswith("api/"):
                raise
            return await super().get_response("_shell.html", scope)


app = FastAPI(title="KittyFace API", version="1.0.0")
# Auth is a header, not a cookie, so a wildcard origin is safe.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Retry-After"],
)
app.include_router(router, prefix="/api/v1")
# Mounted last so the API routes win; skipped when the frontend isn't built.
if FRONTEND_DIR.is_dir():
    app.mount("/", SPAFiles(directory=FRONTEND_DIR, html=True))
