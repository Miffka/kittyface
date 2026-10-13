from datetime import UTC, datetime
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from backend import store
from backend.auth import client_token, consented
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

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_BYTES = 5 * 1024 * 1024


def failed(check: str) -> JSONResponse:
    return JSONResponse({"check": check}, status_code=422)


def owned(upload_id: str, token: str) -> store.Upload:
    upload = store.uploads.get(upload_id)
    if upload is None or upload.token != token:
        raise HTTPException(404)
    return upload


def summary(u: store.Upload) -> UploadSummary:
    return UploadSummary(
        id=u.id,
        created_at=u.created_at,
        model_version=u.metadata.model_version,
        user_measurements=u.metadata.user_measurements,
    )


@router.get("/config", response_model=AppConfig)
def get_config():
    return store.CONFIG


@router.post("/consent", status_code=204)
def post_consent(body: Consent, token: Annotated[str, Depends(client_token)]):
    if body.notice_version != store.CONFIG.notice_version:
        return failed("notice_version")
    store.consents[token] = body.notice_version


@router.post("/events", status_code=204)
def post_event(event: DetectionEvent):
    store.events.append(event)


@router.get("/uploads", response_model=list[UploadSummary])
def list_uploads(token: Token):
    mine = [u for u in store.uploads.values() if u.token == token]
    return [summary(u) for u in sorted(mine, key=lambda u: u.created_at, reverse=True)]


@router.post("/uploads", status_code=201, response_model=SaveResult)
async def save_upload(
    token: Token,
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
    store.uploads[upload_id] = store.Upload(
        id=upload_id,
        token=token,
        created_at=datetime.now(UTC).isoformat(),
        metadata=meta,
        image=data,
        content_type=image.content_type,
    )
    return SaveResult(id=upload_id)


@router.get("/uploads/{upload_id}", response_model=UploadDetail)
def get_upload(upload_id: str, token: Token):
    u = owned(upload_id, token)
    return UploadDetail(**summary(u).model_dump(), metadata=u.metadata)


@router.delete("/uploads/{upload_id}", status_code=204)
def delete_upload(upload_id: str, token: Token):
    del store.uploads[owned(upload_id, token).id]


@router.get("/uploads/{upload_id}/image")
def get_upload_image(upload_id: str, token: Token):
    u = owned(upload_id, token)
    return Response(u.image, media_type=u.content_type)
