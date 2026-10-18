# APP-21: know what's happening

Groomed retrospectively from the [APP-21 entry](../backlog.md#app-21-know-whats-happening). Status: delivered.

**Story.** As an operator, I want an anonymous event after each detection attempt, so I can see load times, inference times and failure rates with no identifying data.

**Scope.**
- `POST /api/v1/events` takes `model_version`, `backend`, `outcome` (`face`, `no_face`, `load_failure`, `error`), `load_ms` and `inference_ms`. It needs no token and answers 204.
- `backend/db.py` `Event` stores those five fields and an auto id. It stores no token, IP address, user agent or image data.
- `frontend/src/components/Workspace.tsx` `sendEvent` fires after every detection attempt, including a box re-detection. `state/app.tsx` sends `load_failure` when model loading fails.
- `api/http.ts` `postEvent` is fire-and-forget, sends no token header and never throws.

**Acceptance criteria.**
- [x] A successful detection sends an event with outcome `face` and all five fields.
- [x] A no-face result, an error and a model-load failure each send an event with their own outcome.
- [x] An event is accepted without a token (`test_events_need_no_token`).
- [x] The stored columns hold no token, IP or image data.
- [x] A failed event request never shows an error to the user.

**Depends on.** [APP-2](APP-2.md), [APP-3](APP-3.md).

**Out of scope.** Nothing found. Alerting on these events is [APP-24](../backlog.md#app-24-get-paged-when-something-breaks).
