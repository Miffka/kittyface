"""SQLAlchemy engine and tables. DATABASE_URL names the Postgres database."""

import os

from sqlalchemy import JSON, LargeBinary, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

DATABASE_URL = os.environ["DATABASE_URL"]
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(engine)


def get_session():
    with SessionLocal() as session:
        yield session


class Base(DeclarativeBase):
    pass


class Consent(Base):
    __tablename__ = "consents"
    token: Mapped[str] = mapped_column(primary_key=True)
    notice_version: Mapped[str]


class Upload(Base):
    __tablename__ = "uploads"
    id: Mapped[str] = mapped_column(primary_key=True)
    token: Mapped[str] = mapped_column(index=True)
    # ISO-8601 UTC string: sorts chronologically and round-trips unchanged.
    created_at: Mapped[str]
    meta: Mapped[dict] = mapped_column(JSON)  # UploadMetadata as JSON
    image: Mapped[bytes] = mapped_column(LargeBinary)
    content_type: Mapped[str]


class Event(Base):
    __tablename__ = "events"
    id: Mapped[int] = mapped_column(primary_key=True)
    model_version: Mapped[str | None]
    backend: Mapped[str | None]
    outcome: Mapped[str]
    load_ms: Mapped[float | None]
    inference_ms: Mapped[float | None]
