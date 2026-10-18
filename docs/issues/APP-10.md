# APP-10: handle the uploaded image correctly

Groomed retrospectively from the [APP-10 entry](../backlog.md#app-10-handle-the-uploaded-image-correctly). Status: delivered (partial). The work runs in the browser, not on the server.

**Story.** As an operator, I want every stored image validated and stripped of metadata, so stored images are safe regardless of how the camera saved them.

**Scope.**
- `frontend/src/lib/image.ts`:
  - `validateImageFile`: JPEG, PNG or WebP, 1 byte to 5 MB.
  - `readOrientation`: EXIF orientation 1-8 from JPEG APP1, PNG `eXIf` and WebP `EXIF` chunks. Returns 1 when absent or unreadable.
  - `stripMetadata`: drops JPEG APP1 and APP13 segments, PNG `eXIf`, `tEXt`, `iTXt`, `zTXt` and `tIME` chunks, and WebP `EXIF` and `XMP ` chunks. Pixel data is not re-encoded.
  - `uprightBitmap`: decodes the stripped file and rotates the bitmap by the orientation for display and detection.
- `Workspace.tsx` uploads the stripped file and sends the orientation value in the metadata. `history/$id.tsx` applies the stored orientation when it reopens the image.
- `backend/routers.py` `save_upload`: answers 415 for a declared content type outside the three formats and 413 for a body over 5 MB.

**Acceptance criteria.**
- [x] A file of another type, or over 5 MB, is refused in the browser with a stated reason.
- [x] The server answers 415 for a bad content type and 413 for an oversized body (`test_save_rejects_bad_input`).
- [x] A JPEG with orientation 6 reads as 6, and the stripped output has no EXIF block and reads as 1 (`image-and-wording.test.ts`).
- [x] An image with no orientation reads as 1 and is not rotated.

**Depends on.** Nothing.

**Out of scope.** Each item is open in [APP-10 in the backlog](../backlog.md#app-10-handle-the-uploaded-image-correctly).
- Server-side stripping and orientation. A client that skips the browser code can upload an image with metadata.
- Checking the file's real format. The server trusts the declared content type.
- Storing an upright image. The server keeps the stripped original and the client rotates it on every view.
- PNG and WebP orientation cases have no test; only JPEG does.
