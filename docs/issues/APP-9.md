# APP-9: backend and an anonymous token

Groomed retrospectively from the [APP-9 entry](../backlog.md#app-9-backend-and-an-anonymous-token). Status: delivered (partial).

**Story.** As a returning user, I want the app to recognize my browser without an account, so my saved work links back to me.

**Scope.**
- `backend/main.py`: a FastAPI app under `/api/v1`, CORS open to any origin (auth is a header, not a cookie), SQLite by default. Start it with `uv run uvicorn backend.main:app --reload --port 8091`.
- `frontend/src/api/storage.ts` `getClientToken`: the browser generates 16 random bytes as 32 hex characters on first visit and keeps them in localStorage. The same value goes in the `X-Client-Token` header on every request except `POST /events`.
- `backend/auth.py` `client_token`: accepts a header that matches `^[0-9a-f]{32}$`, otherwise answers 403.
- `GET /api/v1/config` needs no token.

**Acceptance criteria.**
- [x] The app starts against SQLite with no configuration.
- [x] A request with a well-formed token is attributed to that token, and a later request with the same token sees the same data (`test_upload_round_trip`).
- [x] A request with a missing or malformed token gets 403 (`test_uploads_forbidden_without_valid_consented_token`).
- [x] Two tokens do not see each other's data (`test_other_token_cannot_see_upload`).

**Depends on.** Nothing.

**Out of scope.**
- A health-check route. None exists. Open in [APP-9 in the backlog](../backlog.md#app-9-backend-and-an-anonymous-token).
- The server issuing the token. The browser generates it and the server accepts any well-formed value. Decide whether that is acceptable or whether the server should issue it; open in the same backlog entry.
