# APP-27: consent re-prompt on 403

Groomed retrospectively. New ID, not in the original backlog. Status: delivered.

**Story.** As a user whose consent no longer counts, I want the notice shown again, so I can accept it and carry on instead of seeing a broken page.

**Scope.**
- `frontend/src/api/errors.ts` `notifyConsentRequired` and `onConsentRequired`: a listener list that fires on any 403 from `api/http.ts`.
- `frontend/src/state/app.tsx`: on that signal the provider clears the stored notice version, which opens `ConsentModal`. After "I agree", `postConsent` runs and the new version is stored.
- On start, the provider also compares the stored version with `notice_version` from `GET /config`. The modal opens on a mismatch or when no version is stored.
- `GET /config` is outside the consent gate, so the notice version is available before consent.

**Acceptance criteria.**
- [x] A 403 from the server notifies consent listeners (`api-client.test.ts`).
- [x] After a 403 the consent dialog opens and the stored version is cleared.
- [x] Agreeing stores the current version and closes the dialog.
- [x] If the notice cannot be loaded, the dialog shows a Retry link and keeps "I agree" disabled.

**Depends on.** [APP-13](APP-13.md).

**Out of scope.** Nothing found. The dialog and gate themselves are in [APP-13](APP-13.md).
