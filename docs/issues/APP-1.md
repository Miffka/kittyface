# APP-1: desktop upload, no detection yet

Groomed retrospectively from the [APP-1 entry](../backlog.md#app-1-desktop-upload-no-detection-yet). Status: delivered (partial). This file describes what shipped.

**Story.** As a visitor, I want to upload a cat photo and see it on screen, so I can start working on it.

**Scope.**
- `frontend/src/components/UploadZone.tsx`: a drop zone and a "Choose file" button. The file input accepts `image/jpeg`, `image/png` and `image/webp`.
- `frontend/src/lib/image.ts` `validateImageFile`: refuses any other type, an empty file, and a file over 5 MB with one message: "This file can't be used. Please choose a JPEG, PNG or WebP image up to 5 MB."
- `frontend/src/components/Workspace.tsx`: shows the refusal in an alert panel with a "Try another photo" button. A valid photo is displayed in the editor.

**Acceptance criteria.**
- [x] Choosing a JPEG, PNG or WebP of 5 MB or less shows the photo in the editor.
- [x] Choosing a GIF, a file over 5 MB, or an empty file shows the refusal message and no photo.
- [x] "Try another photo" returns to the empty upload zone.
- [x] `frontend/src/test/image-and-wording.test.ts` covers the type and size rule.

**Depends on.** Nothing.

**Out of scope.**
- The phone notice. The shipped app has no device check. It is responsive and the editor supports touch drag and pinch zoom. PLAN_PROJECT.md item 13 says desktop only, so this conflicts with what was built. Open decision for the product owner: restore the notice or drop item 13. The notice criterion stays in [APP-1 in the backlog](../backlog.md#app-1-desktop-upload-no-detection-yet) until then.
