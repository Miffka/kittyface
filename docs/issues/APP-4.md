# APP-4: fix a bad box

Groomed retrospectively from the [APP-4 entry](../backlog.md#app-4-fix-a-bad-box). Status: delivered (partial).

**Story.** As a user whose cat's box came out wrong, I want to move and resize it and have the landmarks re-detected on the corrected crop.

**Scope.**
- `frontend/src/components/Editor.tsx`: an "Edit box" button switches to box mode. The box can be dragged and resized from eight handles, with a minimum size of 8 px. "Cancel" restores the previous box. Confirming calls `onBoxRedetect(draftBox)`.
- `frontend/src/components/Workspace.tsx` `redetect`: runs `detectLandmarks` on the new box, replaces both the detected and the working landmarks, clears the moved flags, resets the save state, and sends a detection event. The detector's original box stays in the session as `detectorBox`.

**Acceptance criteria.**
- [x] Moving or resizing the box and confirming re-runs landmark detection and the overlay updates.
- [x] Cancelling leaves the box and landmarks unchanged.
- [x] The original detector box is kept for the save payload.

**Depends on.** [APP-3](APP-3.md).

**Out of scope.**
- Confirming an unchanged box must not re-run detection. Today `commitBox` always calls `onBoxRedetect`, so it does. Open in [APP-4 in the backlog](../backlog.md#app-4-fix-a-bad-box).
