"""Anonymous per-browser client token plus the consent gate (see openapi.yaml)."""

import re
from typing import Annotated

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from backend import store
from backend.db import Consent, get_session

TOKEN_RE = re.compile(r"^[0-9a-f]{32}$")


def client_token(x_client_token: Annotated[str | None, Header()] = None) -> str:
    if x_client_token is None or not TOKEN_RE.match(x_client_token):
        raise HTTPException(403)
    return x_client_token


def consented(
    token: Annotated[str, Depends(client_token)],
    session: Annotated[Session, Depends(get_session)],
) -> str:
    consent = session.get(Consent, token)
    if consent is None or consent.notice_version != store.CONFIG.notice_version:
        raise HTTPException(403)
    return token
