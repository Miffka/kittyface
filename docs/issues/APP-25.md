# APP-25: API service layer with a mock

Groomed retrospectively. New ID, not in the original backlog. Status: delivered.

**Story.** As a developer, I want every backend call to go through one service, with an in-memory mock behind the same interface, so the frontend runs and is tested without a backend.

**Scope.**
- `frontend/src/api/types.ts` `ApiService`: `getConfig`, `postConsent`, `postEvent`, `saveUpload`, `listUploads`, `getUpload`, `getUploadImage`, `deleteUpload`.
- `frontend/src/api/client.ts` exports one `api`. It is the mock when `VITE_USE_MOCK_API=true` and the HTTP service otherwise. `VITE_API_BASE_URL` sets the server; `frontend/.env.development` points it at port 8091.
- `api/http.ts` builds URLs under `/api/v1`, adds the `X-Client-Token` header, and sends uploads as multipart with `image` and `metadata` parts.
- `api/errors.ts` maps statuses to user messages: 403 consent, 404 missing upload, 413 too large, 415 unsupported type, 422 with the check name, 429 with a `Retry-After` countdown (seconds or HTTP date), anything else generic. Network failures map to the generic message.
- `api/mock.ts` keeps uploads, consents and events in memory and applies the same error mapping.
- `openapi.yaml` describes the contract derived from this layer.
- Tests: `frontend/src/test/api-client.test.ts`, `mock-api.test.ts`.

**Acceptance criteria.**
- [x] No component calls `fetch` directly; they use `api` (per `frontend/AGENTS.md`).
- [x] Each mapped status produces its message (`api-client.test.ts`).
- [x] The token header is sent on every call except events (`api-client.test.ts`).
- [x] The mock saves, lists, opens and deletes uploads and rejects bad ones with the same messages (`mock-api.test.ts`).
- [x] Setting `VITE_USE_MOCK_API=true` runs the app without a backend.

**Depends on.** Nothing.

**Out of scope.**
- The backend never answers 429; the client handling is untested against a real server. Rate limiting is [APP-16](../backlog.md#app-16-stop-abuse).
- Keeping `openapi.yaml` in step with the FastAPI routes automatically. No check exists.
