from datetime import UTC, datetime
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from backend import store
from backend.auth import client_token, consented
from backend.db import Consent as ConsentRow
from backend.db import Event, Upload, get_session
from backend.models import (
    AppConfig,
    Consent,
    DetectionEvent,
    SaveResult,
    UploadDetail,
    UploadMetadata,
    UploadSummary,
)

router = APIRouter()
Token = Annotated[str, Depends(consented)]
DB = Annotated[Session, Depends(get_session)]

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_BYTES = 5 * 1024 * 1024


def failed(check: str) -> JSONResponse:
    return JSONResponse({"check": check}, status_code=422)


def owned(upload_id: str, token: str, db: Session) -> Upload:
    upload = db.get(Upload, upload_id)
    if upload is None or upload.token != token:
        raise HTTPException(404)
    return upload


def summary(u: Upload) -> UploadSummary:
    return UploadSummary(
        id=u.id,
        created_at=u.created_at,
        model_version=u.meta["model_version"],
        user_measurements=u.meta["user_measurements"],
    )


# Unauthenticated; an unreachable database raises, so the deploy check sees a 500.
@router.get("/health")
def health(db: DB):
    db.execute(text("SELECT 1"))
    return {"status": "ok"}


@router.get("/config", response_model=AppConfig)
def get_config():
    return store.CONFIG


@router.post("/consent", status_code=204)
def post_consent(body: Consent, token: Annotated[str, Depends(client_token)], db: DB):
    if body.notice_version != store.CONFIG.notice_version:
        return failed("notice_version")
    db.merge(ConsentRow(token=token, notice_version=body.notice_version))
    db.commit()


@router.post("/events", status_code=204)
def post_event(event: DetectionEvent, db: DB):
    db.add(Event(**event.model_dump()))
    db.commit()


@router.get("/uploads", response_model=list[UploadSummary])
def list_uploads(token: Token, db: DB):
    mine = db.scalars(
        select(Upload).where(Upload.token == token).order_by(Upload.created_at.desc())
    )
    return [summary(u) for u in mine]


@router.post("/uploads", status_code=201, response_model=SaveResult)
async def save_upload(
    token: Token,
    db: DB,
    image: Annotated[UploadFile, File()],
    # The client sends metadata as a JSON Blob, so it arrives as a file part.
    metadata: Annotated[UploadFile, File()],
):
    if image.content_type not in ALLOWED_TYPES:
        raise HTTPException(415)
    data = await image.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413)
    try:
        meta = UploadMetadata.model_validate_json(await metadata.read())
    except ValidationError as e:
        loc = e.errors()[0]["loc"]
        return failed(str(loc[0]) if loc else "metadata")
    if meta.notice_version != store.CONFIG.notice_version:
        return failed("notice_version")
    upload_id = uuid4().hex
    db.add(
        Upload(
            id=upload_id,
            token=token,
            created_at=datetime.now(UTC).isoformat(),
            meta=meta.model_dump(mode="json"),
            image=data,
            content_type=image.content_type,
        )
    )
    db.commit()
    return SaveResult(id=upload_id)


@router.get("/uploads/{upload_id}", response_model=UploadDetail)
def get_upload(upload_id: str, token: Token, db: DB):
    u = owned(upload_id, token, db)
    return UploadDetail(**summary(u).model_dump(), metadata=u.meta)


@router.delete("/uploads/{upload_id}", status_code=204)
def delete_upload(upload_id: str, token: Token, db: DB):
    db.delete(owned(upload_id, token, db))
    db.commit()


@router.get("/uploads/{upload_id}/image")
def get_upload_image(upload_id: str, token: Token, db: DB):
    u = owned(upload_id, token, db)
    return Response(u.image, media_type=u.content_type)
