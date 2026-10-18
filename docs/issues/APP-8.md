# APP-8: show the proxy scores

Groomed retrospectively from the [APP-8 entry](../backlog.md#app-8-show-the-proxy-scores). Status: delivered (partial). The cutoffs come from RSCH-5's `models/thresholds.json`, and no test yet places a ratio exactly at a cutoff.

**Story.** As a user, I want each ratio turned into a 0-2 proxy score that is clearly marked as unvalidated.

**Scope.**
- `frontend/src/geometry/measurements.ts` `scoreRatio(ratio, rule)`: two cutoffs and a direction (`ascending` or `descending`) give 0, 1 or 2. A ratio equal to the lower ascending cutoff scores 1; equal to the upper cutoff scores 2. For descending rules, equal to the upper cutoff scores 1 and equal to the lower cutoff scores 2.
- Cutoffs come from `GET /config` and are never hard-coded in the UI. `backend/store.py` builds `CONFIG` from `models/thresholds.json` (version `fgs-manual-1.0.0`). The mock API in `frontend/src/api/mock.ts` holds a copy, since Vite's dev server can't load files outside `frontend/`, and `mock-api.test.ts` fails if the copy drifts from the file.
- `frontend/src/lib/units.ts`: labels "Ear position (proxy)", "Orbital tightening (proxy)", "Muzzle tension (proxy)", "Whisker change (proxy, measures whisker pads)". Head position always reads "Not possible to score".
- `frontend/src/components/Layout.tsx` `Banner`: a persistent note, "Research tool. These are geometric proxy measurements, not a medical or welfare assessment."
- `ResultsPanel.tsx` shows no total. It prints the model, threshold and geometry versions under the table. Saved uploads store all three.

**Acceptance criteria.**
- [x] Every unit shows a 0, 1 or 2 score with a "(proxy)" label.
- [x] The banner is visible on every page.
- [x] No combined score appears.
- [x] Head position reads "Not possible to score".
- [x] `scoreRatio` returns the expected score for values below, between and above the cutoffs, in both directions (`geometry-detection.test.ts`).
- [x] The threshold version and geometry version are shown and saved with each result.

**Depends on.** [APP-7](APP-7.md).

**Out of scope.**
- A test that places a ratio exactly at each cutoff. The existing test uses values away from the cutoffs. Open in [APP-8 in the backlog](../backlog.md#app-8-show-the-proxy-scores).
