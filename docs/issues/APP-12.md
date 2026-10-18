# APP-12: see and delete your history

Groomed retrospectively from the [APP-12 entry](../backlog.md#app-12-see-and-delete-your-history). Status: delivered.

**Story.** As a returning user, I want to see my past uploads and delete any of them, so I control what stays saved about me.

**Scope.**
- `GET /api/v1/uploads` lists the caller's uploads, newest first, with id, `created_at`, model version and the four user measurements.
- `DELETE /api/v1/uploads/{id}` removes the row, including the image and metadata, and answers 204. An id owned by another token, or unknown, answers 404.
- `frontend/src/routes/history.index.tsx`: the list with an Open link and a Delete button per row, a confirmation dialog ("The photo and its landmarks are removed from the server. This can't be undone."), an empty state, and error messages.
- `frontend/src/routes/history.$id.tsx`: the saved upload opened read-only, with its image, landmarks and scores.

**Acceptance criteria.**
- [x] The list returns exactly the caller's uploads, newest first (`test_upload_round_trip`, `test_other_token_cannot_see_upload`).
- [x] Deleting removes the row, so a later fetch answers 404.
- [x] Deleting another token's id answers 404 and leaves the upload in place.
- [x] The History page asks for confirmation before deleting and refreshes the list afterwards.
- [x] An empty history shows "Nothing saved yet."

**Depends on.** [APP-11](APP-11.md).

**Out of scope.** Nothing found. The consent record is not removed on delete; that belongs to [APP-13](APP-13.md).
