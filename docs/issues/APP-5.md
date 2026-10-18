# APP-5: fix a bad landmark

Groomed retrospectively from the [APP-5 entry](../backlog.md#app-5-fix-a-bad-landmark). Status: delivered.

**Story.** As a user whose cat's landmarks are slightly off, I want to drag individual points to the right place, so the result reflects the real face.

**Scope.**
- `frontend/src/components/Editor.tsx`: pointer drag on any of the 48 points, with a larger hit target on touch screens. Arrow keys nudge the selected point. Zoom buttons, wheel and pinch change the view. A hover or selection label names the point.
- Each move sets that point's `moved` flag. `Workspace.tsx` keeps `landmarks`, `detected` (model output) and `moved` side by side, and shows "N of 48 points moved by hand".
- "Reset" restores the detected landmarks and clears every flag. It is disabled when no point has moved.

**Acceptance criteria.**
- [x] Dragging a point updates its coordinate and sets its moved flag.
- [x] Points never dragged keep the detected coordinate and a false flag.
- [x] The counter under the image matches the number of true flags.
- [x] "Reset" restores the detected coordinates and clears all flags.

**Depends on.** [APP-3](APP-3.md).

**Out of scope.** Nothing found.
