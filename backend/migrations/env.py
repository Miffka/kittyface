"""Runs migrations against backend.db's engine, so DATABASE_URL picks the database."""

from alembic import context

from backend.db import Base, engine

# No fileConfig: it would replace uvicorn's logging when main.py migrates on start.
with engine.connect() as connection:
    context.configure(connection=connection, target_metadata=Base.metadata)
    with context.begin_transaction():
        context.run_migrations()
