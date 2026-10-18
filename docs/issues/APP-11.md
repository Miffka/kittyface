# APP-11: save your result

Groomed retrospectively from the [APP-11 entry](../backlog.md#app-11-save-your-result). Status: delivered (partial).

**Story.** As a user, I want my upload, corrections and scores to still be there after a reload.

**Scope.**
- `backend/db.py` `Upload`: id, token, `created_at` (ISO-8601 UTC string), `meta` (JSON), `image` (blob), `content_type`.
- `backend/models.py` `UploadMetadata`: orientation, detector box, final box, model and user landmarks (48 points each), moved flags (48), model and user measurements (4 each), and the model, threshold, geometry and notice versions.
- `POST /api/v1/uploads` (multipart: `image`, `metadata`) validates, writes one row in one commit and returns `{id}` with 201. `GET /api/v1/uploads/{id}` returns the stored metadata unchanged. `GET /api/v1/uploads/{id}/image` returns the image bytes with the stored content type.
- Every route requires a consented token (see [APP-13](APP-13.md)). An id owned by another token answers 404.
- Frontend: the Save button in `ResultsPanel.tsx` sends the payload from `Workspace.tsx`. `routes/history.$id.tsx` reopens a saved upload read-only.

**Acceptance criteria.**
- [x] Saving, then fetching with the same token returns the same landmarks, moved flags and measurements (`test_upload_round_trip`).
- [x] The saved image comes back byte for byte with its content type.
- [x] A token that saved nothing gets an empty list, and another token's id answers 404 (`test_other_token_cannot_see_upload`).
- [x] A saved row survives a server restart (`test_saved_upload_is_in_the_configured_database`).
- [x] The Save button is disabled while saving, and a failure shows the mapped error message.
- [x] Editing after a save returns the button to its idle state.

**Depends on.** [APP-6](APP-6.md), [APP-8](APP-8.md), [APP-9](APP-9.md), [APP-10](APP-10.md).

**Out of scope.**
- Separate tables for landmarks, ratios and scores. Everything sits in one JSON column; the choice is recorded in `docs/DECISIONS.md`. Open in [APP-11 in the backlog](../backlog.md#app-11-save-your-result) if the product owner wants the split.
- Rolling back on partial failure is trivially met by a single commit but has no failure-injection test.
