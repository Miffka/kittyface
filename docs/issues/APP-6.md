# APP-6: warn before discarding edits

Groomed retrospectively from the [APP-6 entry](../backlog.md#app-6-warn-before-discarding-edits). Status: delivered.

**Story.** As a user who already fixed some landmarks, I want a warning before a box change throws my edits away.

**Scope.** `frontend/src/components/Editor.tsx` `onDone`: when any moved flag is true, an alert dialog opens before the box change is applied. Confirming runs the re-detection from [APP-4](APP-4.md), which clears the flags. The dialog reads "Replace landmark edits?" with Cancel and Continue. Cancel runs `cancelBox`, which restores the previous box and leaves box mode.

**Acceptance criteria.**
- [x] Confirming a changed box with no moved points re-detects with no dialog.
- [x] Confirming with at least one moved point opens the dialog first.
- [x] Accepting re-detects and clears the flags.
- [x] Declining keeps the current box and edited points.

**Depends on.** [APP-4](APP-4.md), [APP-5](APP-5.md).

**Out of scope.** Nothing found.
