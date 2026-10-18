# APP-13: ask for consent first

Groomed retrospectively from the [APP-13 entry](../backlog.md#app-13-ask-for-consent-first). Status: delivered (partial).

**Story.** As a user, I want to be asked to consent to research use before my first save, so the app meets its stated data terms.

**Scope.**
- `backend/db.py` `Consent`: token and notice version. `POST /api/v1/consent` stores the version for the caller's token. A version other than the current one answers 422 with `{"check": "notice_version"}`.
- `backend/auth.py` `consented`: every upload route depends on it. A token with no record, or a record for an older notice version, gets 403 before the request body is read.
- `GET /api/v1/config` returns the current `notice_version`.
- `frontend/src/components/ConsentModal.tsx`: a blocking dialog that explains research use, proxy status and the takedown contact, with one "I agree" button. The accepted version is kept in localStorage.
- `UploadMetadata.notice_version` must equal the current version, or the save answers 422.

**Acceptance criteria.**
- [x] A token that has not consented gets 403 on upload routes (`test_uploads_forbidden_without_valid_consented_token`).
- [x] Consenting to the current version lets the token save, and the version is stored with the upload.
- [x] Consenting to another version is refused with 422 (`test_consent_rejects_wrong_notice_version`).
- [x] A new notice version shows the dialog again, because the stored version no longer matches the config.
- [x] The dialog cannot be dismissed with Escape.

**Depends on.** [APP-11](APP-11.md), [APP-12](APP-12.md).

**Out of scope.**
- Deleting an upload also deleting its consent record. Today the consent row stays. Open in [APP-13 in the backlog](../backlog.md#app-13-ask-for-consent-first). Decide first whether one consent row per token should vanish when only one of several uploads is deleted.
- The modal text links no Terms page, because none exists: [APP-14](APP-14.md).
