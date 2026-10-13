from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend import store
from backend.db import Base, SessionLocal, engine
from backend.routers import router

# ponytail: create_all only adds missing tables; APP-20 brings Alembic migrations.
Base.metadata.create_all(engine)
with SessionLocal() as session:
    store.seed(session)

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
