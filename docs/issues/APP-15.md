# APP-15: reject malformed submissions with a reason

Groomed retrospectively from the [APP-15 entry](../backlog.md#app-15-reject-malformed-submissions-with-a-reason). Status: delivered (partial).

**Story.** As an operator, I want malformed submissions rejected with a named reason, so I can trust what is stored.

**Scope.**
- `backend/models.py` `UploadMetadata`: Pydantic checks shape and types. Orientation is 1-8. Landmarks, moved flags and measurements have fixed lengths (48, 48, 4). Each measurement has a known unit, a numeric ratio and a score of 0, 1 or 2.
- `backend/routers.py` `save_upload`: on a validation error it answers 422 with `{"check": "<first failing field>"}`. A wrong notice version answers `{"check": "notice_version"}`.
- Frontend: `api/errors.ts` shows "The landmarks could not be saved: <check>".

**Acceptance criteria.**
- [x] A payload with 47 landmarks answers 422 naming `user_landmarks` (`test_save_rejects_bad_input`).
- [x] A payload with a stale notice version answers 422 naming `notice_version`.
- [x] A valid payload is saved and returned unchanged.
- [x] The browser shows the check name to the user.

**Depends on.** [APP-11](APP-11.md).

**Out of scope.** Each item is open in [APP-15 in the backlog](../backlog.md#app-15-reject-malformed-submissions-with-a-reason).
- Naming every failed check. Only the first is returned.
- A counter per rejection reason.
- Plausibility checks (coordinates inside the image, landmarks inside the box, ratios matching the landmarks). Shape only is checked today. The frontend mock uses the check name `landmarks_inside_box` in its tests, but the server has no such check.
