# APP-7: show the raw ratios

Groomed retrospectively from the [APP-7 entry](../backlog.md#app-7-show-the-raw-ratios). Status: delivered (partial). The formulas are placeholders.

**Story.** As a user, I want to see each action unit's raw geometric ratio, so I can see what the app measures before it becomes a score.

**Scope.**
- `frontend/src/geometry/measurements.ts` `measure(landmarks, thresholds)`: pure and synchronous, throws unless given 48 points. Returns one `{unit, ratio, score}` per unit in the order ear, orbital, muzzle, whisker. Ratios are normalized by the inter-ocular distance (eye-centre to eye-centre), except orbital, which is eye height over eye width.
- `frontend/src/components/ResultsPanel.tsx`: a table with one ratio per unit, three decimals, recomputed on every drag.
- `GEOMETRY_VERSION` is `mock-geometry-0.1.0`.

**Acceptance criteria.**
- [x] Each of the four units shows a ratio for the current landmarks.
- [x] Moving a point changes the affected ratio (`geometry-detection.test.ts`).
- [x] Calling `measure` twice on the same points returns equal results.
- [x] The save payload carries ratios for both the model landmarks and the user landmarks (`Workspace.tsx` `onSave`).

**Depends on.** [APP-3](APP-3.md).

**Out of scope.**
- A hand-written port of `kittyface.core.geometry` (eye aspect ratio, ear angle, muzzle spread, yaw), with a match against the Python value within floating-point tolerance. The current formulas are mock values and do not follow PLAN_PROJECT.md items 5-8. Open in [APP-7 in the backlog](../backlog.md#app-7-show-the-raw-ratios).
- Showing model and user ratios side by side. The panel shows only the user set. Open in the same backlog entry.
- Agreement between browser and Python: [APP-17](../backlog.md#app-17-keep-the-browser-and-python-in-agreement).
