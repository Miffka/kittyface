# Backlog

Tasks are tagged `RSCH-N` (research track, `scripts/`) or `APP-N` (app track: backend, frontend, infra). Numbers are stable once assigned; do not renumber or reuse a retired number.

Each task is groomed per `docs/team/pm.md`: a story or problem statement, a scope, checkable acceptance criteria, and its dependencies. Every task is sized to fit one engineer's single session; a task that grew past that got split rather than left large. An engineer who has not read this conversation should be able to implement a task from its entry alone, plus whatever it links to.

The orchestrator picks one track, runs `docs/project_process.md`'s lifecycle to a stopping point, then switches; it does not interleave RSCH and APP tasks in one loop.

## Delivered

These already exist in `src/kittyface/core/` and are referenced by later tasks. Listed here only so the numbering below makes sense.

- **RSCH-1** (E0/E1): landmark ingestion and Procrustes shape space. `geometry.procrustes_align` and `generalized_procrustes`.
- **RSCH-2** (E2): derived-geometry readouts. `geometry.eye_aspect_ratio`, `ear_angle`, `muzzle_spread_ratio`.
- **RSCH-3** (E3): hand-authored anatomical adjacency and its GCN normalization, plus a random-adjacency control. `graph.py`.
- **RSCH-4** (E4): yaw estimators (foreshortening ratio, midline offset) and the superseded centroid proxy. `geometry.yaw_*`.

## Research track

### RSCH-5 (E5): threshold derivation for the 0-2 proxy scores

**Problem.** Each FGS action unit needs a 0-2 proxy score, but nothing yet turns a raw ratio (ear angle, eye aspect ratio, muzzle spread, whisker-pad displacement) into that score. The cutoffs have to come from data, and every future result has to record which cutoff version scored it.

**Scope.**
- A script under `scripts/` that fits 0-2 cutoffs per AU ratio from a labeled dataset and writes `models/thresholds.json`, versioned (a version field plus one entry per AU).
- A written report of the correlation between whisker-pad displacement and muzzle tension, in the form the About page will quote (PLAN_PROJECT.md item 8).
- Unit coverage for the scoring function that reads `thresholds.json` and returns a 0-2 integer for a given ratio and version.

**Acceptance criteria.**
- [ ] `models/thresholds.json` exists, has a version field, and has one cutoff set per AU (ear position, orbital tightening, muzzle tension, whisker change).
- [ ] Given a ratio value and a threshold version, a function returns the correct 0-2 score for values at, just below, and just above each cutoff.
- [ ] The whisker/muzzle correlation number is written down somewhere `docs/AI_WORKFLOW.md` or a linked note can point the About-page copy at.
- [ ] Re-scoring the same landmarks against a new threshold version does not require re-running detection.

**Depends on.** Nothing outstanding.

### RSCH-6 (export): tflite to ONNX conversion and equivalence check

**Problem.** The two tflite models (`cat_face_localizer`, `cat_face_landmarks_full`) need ONNX exports for browser inference (PLAN_PROJECT.md item 15), and every future conversion has to be checked against the tflite original on real photos, not assumed correct.

**Scope.**
- A script that converts both models listed in `models/manifest.json` to ONNX with `tf2onnx` and writes their sha256 into the manifest.
- A fixture set of a handful of representative cat photos, committed or fetched by a pinned script.
- A check script that runs both the tflite and ONNX versions of each model on every fixture and fails on output divergence past a stated numeric tolerance.

**Acceptance criteria.**
- [ ] Running the conversion script produces `.onnx` files next to the `.tflite` ones and updates `models/manifest.json` with their hashes.
- [ ] The check script exits non-zero and names the offending fixture if any output pair diverges past tolerance.
- [ ] The check script exits zero on the current models and fixtures.
- [ ] The numeric tolerance and its justification are written down in the script's own docstring.

**Depends on.** Nothing outstanding.

## App track

This is a Scrum product backlog, not a build plan by layer: stories are ordered so the earliest ones are demoable, and each is cut down to something one engineer finishes in one session. A story is allowed to leave a known shortcut (SQLite only, no rate limit, no manifest verification) for a later story to remove; each later story says which shortcut it's closing.

### APP-1: desktop upload, no detection yet

**Story.** As a visitor, I want to upload a cat photo on a desktop browser and see it previewed, so the app has somewhere to grow detection into.

**Scope.** A device check showing a notice instead of the upload control on phones (PLAN_PROJECT.md item 13). A file picker accepting an image and previewing it. No detection, no backend call.

**Acceptance criteria.**
- [ ] On a phone user agent, the notice shows instead of the upload control.
- [ ] On a desktop browser, choosing an image file shows a preview of it.
- [ ] Choosing a non-image file is refused with a stated reason.

**Depends on.** Nothing outstanding.

### APP-2: detect the face box in the browser

**Story.** As a user, I want the app to draw a box around my cat's face after I upload a photo, so I can see the detector found the right thing.

**Scope.** ONNX Runtime Web (WASM backend) wired to `cat_face_localizer` loaded directly from `models/` (no manifest verification yet, that is APP-19). Run it on APP-1's uploaded image and draw the returned box.

**Acceptance criteria.**
- [ ] Uploading a photo with a clear cat face draws a box around it within a few seconds.
- [ ] A photo with no detectable cat face shows a stated "no face found" outcome, not a stuck spinner.

**Depends on.** APP-1.

### APP-3: detect the 48 landmarks

**Story.** As a user, I want to see the 48 facial landmarks drawn on my cat's face, so I know the full detection pipeline works before any editing exists.

**Scope.** Wire `cat_face_landmarks_full` on the crop from APP-2's box (letterbox/crop math ported from `kittyface.core.geometry`), draw the 48 points.

**Acceptance criteria.**
- [ ] After a box is detected, 48 points appear on the face within a few seconds.
- [ ] The points land in the uploaded image's own pixel coordinates, not the crop's normalized ones.

**Depends on.** APP-2.

### APP-4: fix a bad box

**Story.** As a user whose cat's box came out wrong, I want to adjust it and have the landmarks re-detect on my corrected crop, so a bad initial detection doesn't wreck my result.

**Scope.** A box-editing control over APP-2's detected box. Confirming a changed box re-runs APP-3's landmark detection on the new crop (PLAN_PROJECT.md item 20).

**Acceptance criteria.**
- [ ] Confirming the box unchanged does not re-run landmark detection.
- [ ] Confirming a moved or resized box re-runs landmark detection on the new crop and updates the overlay.

**Depends on.** APP-3.

### APP-5: fix a bad landmark

**Story.** As a user whose cat's landmarks are slightly off, I want to drag individual points to correct them, so my result reflects the true landmarks.

**Scope.** Drag-to-correct on each of the 48 points. A moved flag per point, false until that point's first drag.

**Acceptance criteria.**
- [ ] Dragging a point updates its coordinate and sets its moved flag true.
- [ ] Points never dragged keep the detected coordinate and a false moved flag.

**Depends on.** APP-3.

### APP-6: warn before discarding edits

**Story.** As a user who already fixed some landmarks, I want to be warned before a box change throws my edits away, so I don't lose work by accident.

**Scope.** Extend APP-4's box-confirm flow: if any point has a moved flag set, confirming a further box change prompts first (PLAN_PROJECT.md item 20's confirmation clause).

**Acceptance criteria.**
- [ ] Confirming a changed box with no moved landmarks re-detects with no prompt.
- [ ] Confirming a changed box with at least one moved landmark prompts first.
- [ ] Declining the prompt keeps the current box and edited points; accepting re-detects and clears the moved flags.

**Depends on.** APP-4, APP-5.

### APP-7: show the raw ratios

**Story.** As a user, I want to see each action unit's raw geometric ratio for both the detected and my corrected landmarks, so I can see what the app actually measures before it turns that into a score.

**Scope.** A hand-written TypeScript port of `kittyface.core.geometry`'s ratio functions (eye aspect ratio, ear angle, muzzle spread, yaw estimators), not a transpile. Display the raw number per AU for both landmark sets.

**Acceptance criteria.**
- [ ] Each scoreable AU shows a raw ratio for the model landmarks and, once edited, for the user-corrected landmarks.
- [ ] The displayed ratio for a hand-checked landmark set matches `kittyface.core.geometry`'s value for the same input within floating-point tolerance.

**Depends on.** APP-3.

### APP-8: show the proxy scores

**Story.** As a user, I want each ratio turned into a 0-2 proxy score, clearly marked as unvalidated, so I get the app's actual advertised output.

**Scope.** Read RSCH-5's `models/thresholds.json` in the TypeScript module from APP-7 to produce a 0-2 score per AU. Label every AU "(proxy)", show a persistent notice that scores are not a validated pain assessment, show no combined total, and always show head position as "not possible to score" (PLAN_PROJECT.md items 2, 3, 4, 9). Stamp a version string on the module, carried with every score.

**Acceptance criteria.**
- [ ] Every scoreable AU shows a 0-2 integer score labeled "(proxy)".
- [ ] The non-validated-assessment notice is visible next to the scores; no combined or total score appears anywhere.
- [ ] Head position always reads "not possible to score".
- [ ] A hand-checked ratio at, just below, and just above a threshold cutoff produces the correct score.

**Depends on.** APP-7, RSCH-5.

### APP-9: backend and an anonymous token

**Story.** As a returning user, I want the app to recognize my browser without an account, so a later save can be linked back to me.

**Scope.** A FastAPI app with a health-check route, SQLite by default. A random token issued to a first-time visitor (cookie or a value the frontend persists) and read back on later requests. No uploads table yet.

**Acceptance criteria.**
- [ ] The health-check route responds when the app runs against SQLite with no configuration.
- [ ] A first-time client receives a token; a client presenting that same token is recognized as the same caller on a later request.

**Depends on.** Nothing outstanding.

### APP-10: handle the uploaded image correctly

**Story.** As an operator, I want every stored image validated, correctly oriented, and stripped of metadata, so stored images are safe and consistent regardless of how the camera saved them.

**Scope.** A pure image-handling function: accept JPEG, PNG, or WebP up to 5 MB (reject anything else with a stated reason), apply the sent EXIF orientation value, and strip metadata (including the now-applied orientation tag), per PLAN_PROJECT.md items 25 and 26. No endpoint yet, just the function and its tests.

**Acceptance criteria.**
- [ ] A 6 MB file or an unsupported format is rejected with a stated reason; a 4 MB JPEG, PNG, or WebP is accepted.
- [ ] An image with EXIF orientation 6 comes out upright, with no EXIF block in the output.
- [ ] An image with no EXIF orientation passes through unrotated.

**Depends on.** Nothing outstanding.

### APP-11: save your result

**Story.** As a user, I want my upload, corrections, and scores to still be there if I reload the page, so my work isn't lost the moment I look away.

**Scope.** An `uploads` table: detector box, final box, model landmarks, user landmarks, moved-point flags, ratios and scores for both landmark sets, threshold version (PLAN_PROJECT.md item 21). A save endpoint, scoped to the caller's token, that runs APP-10's image handling and persists everything above in one transaction. A fetch endpoint that returns a saved upload unchanged (no re-computation), letting the frontend restore a result after reload.

**Acceptance criteria.**
- [ ] Saving a completed result, then fetching it by the same token after a reload, returns the same box, landmarks, moved flags, ratios, scores, and threshold version.
- [ ] A token that never saved anything gets nothing back, and cannot fetch another token's saved upload.
- [ ] If any part of the save fails, nothing from that save is left half-written.

**Depends on.** APP-6, APP-8, APP-9, APP-10.

### APP-12: see and delete your history

**Story.** As a returning user, I want to see my past uploads and delete any of them, so I control what stays saved about me.

**Scope.** A list endpoint and a delete endpoint, both scoped to the caller's token, plus a minimal frontend page for both (PLAN_PROJECT.md item 22). Delete cascades to that upload's landmarks, ratios, and scores.

**Acceptance criteria.**
- [ ] Listing returns exactly the caller's own uploads.
- [ ] Deleting an upload removes it and its derived data from the database, not just from the list.
- [ ] Deleting another token's upload id is refused.

**Depends on.** APP-11.

### APP-13: ask for consent first

**Story.** As a user, I want to be asked to consent to research use before my first upload, and to have that consent honored on deletion, so the app meets its stated data terms.

**Scope.** A consent record (token, timestamp, notice version) and a gate on APP-11's save path that refuses to save without a matching current-version record (PLAN_PROJECT.md item 23). Extend APP-12's delete to remove the consent record too.

**Acceptance criteria.**
- [ ] A save attempt with no prior consent fails before any image processing, naming consent as the reason.
- [ ] Recording consent for the current notice version, then saving, succeeds and stores that version with the upload.
- [ ] Bumping the notice version requires fresh consent even from a previously-consented token.
- [ ] Deleting an upload removes its consent record too.

**Depends on.** APP-11, APP-12.

### APP-14: legal and About pages

**Story.** As a user or reviewer, I want an About page that cites the FGS and explains the proxy scores honestly, and a Terms page covering photo rights and takedowns, so the app is upfront about what it does and doesn't measure.

**Scope.** An About page: FGS citation in text only (no FGS images, text, or logo), the CC BY-NC 4.0 model licence attribution, RSCH-5's muzzle-tension/whisker-change correlation stat, and the only place in the app where "pain" appears (PLAN_PROJECT.md items 4, 8, 10, 11). A Terms page: the photo-rights condition the uploader accepts, and a takedown contact (item 12). A recorded decision in `docs/DECISIONS.md` on whether an Impressum is required, and the page added if so.

**Acceptance criteria.**
- [ ] "Pain" appears in the app's UI text only on the About page.
- [ ] The About page cites the FGS without reproducing any FGS image, text, or logo, states the model licence attribution, and shows RSCH-5's correlation stat.
- [ ] The Terms page states the photo-rights condition and a takedown contact.
- [ ] The Impressum decision is recorded in `docs/DECISIONS.md`, and a page exists if the decision was "required".

**Depends on.** RSCH-5.

### APP-15: reject malformed submissions with a reason

**Story.** As an operator, I want malformed submissions rejected with a named reason instead of silently corrupting the database, so I can trust what's stored.

**Scope.** Schema validation on APP-11's save payload (shape, types, coordinate ranges), returning 422 naming every failed check, and a counter per rejection reason (PLAN_PROJECT.md item 19).

**Acceptance criteria.**
- [ ] A payload with the wrong shape or type returns 422 naming the specific failure.
- [ ] A valid payload passes through to APP-11's save path unchanged.
- [ ] Each rejection increments a queryable counter keyed by reason.

**Depends on.** APP-11.

### APP-16: stop abuse

**Story.** As an operator, I want per-IP rate limiting on uploads, so one client can't exhaust the free-tier instance.

**Scope.** Rate-limiting middleware on APP-11's save path (PLAN_PROJECT.md item 22's "rate limiting is per IP").

**Acceptance criteria.**
- [ ] A client under the configured rate saves normally.
- [ ] A client exceeding the configured rate receives 429 on the next attempt.

**Depends on.** APP-11.

### APP-17: keep the browser and Python in agreement

**Story.** As an operator, I want the JS geometry module checked against the Python reference on shared test vectors in every CI run, so a future change to either can't silently drift them apart.

**Scope.** A shared set of test vectors consumed by a Vitest suite (against APP-7/APP-8's TypeScript module) and the existing pytest suite (against `kittyface.core.geometry` and RSCH-5's scorer). Both run in CI (PLAN_PROJECT.md items 17, 18).

**Acceptance criteria.**
- [ ] The same test vectors pass in both Vitest and pytest.
- [ ] CI runs both suites and fails the build if either diverges from the vectors.
- [ ] The JS module's version string is asserted against in the test vectors, not just present.

**Depends on.** APP-8.

### APP-18: verify models before running them

**Story.** As an operator, I want the browser to verify each model file's hash before using it, and model files served with long-lived caching, so model delivery is both safe and cheap to repeat.

**Scope.** Serve `models/manifest.json` and the model files with cache headers appropriate to content that only changes when its hash changes (PLAN_PROJECT.md item 16). Add browser-side hash verification against the manifest, replacing APP-2/APP-3's direct unverified load.

**Acceptance criteria.**
- [ ] A model file response carries a long max-age cache header.
- [ ] An unmodified model file verifies; a truncated or altered one is refused before use.
- [ ] A manifest hash bump causes a re-fetch and re-verify with no cache-busting query string needed.

**Depends on.** APP-2, APP-3.

### APP-19: check every model conversion in CI

**Story.** As an operator, I want RSCH-6's conversion check to run automatically, so a bad ONNX export can't ship unnoticed.

**Scope.** A CI job running RSCH-6's check script on any push touching `models/` or the conversion script (PLAN_PROJECT.md item 15).

**Acceptance criteria.**
- [ ] The job fails when RSCH-6's check script exits non-zero.
- [ ] The job passes on the current committed models and fixtures.
- [ ] The job only runs on pushes touching the relevant paths.

**Depends on.** RSCH-6.

### APP-20: move off SQLite

**Story.** As an operator, I want the backend to run against Postgres in production while staying on SQLite locally, with migrations applied automatically on start, so the app is ready to deploy.

**Scope.** SQLAlchemy engine selection by `DATABASE_URL` (SQLite when unset, whatever it names otherwise). Alembic migrations covering every schema change from APP-9 through APP-15. Migrate-on-start (PLAN_PROJECT.md items 28, 29).

**Acceptance criteria.**
- [ ] With no `DATABASE_URL`, the app runs against SQLite exactly as before.
- [ ] With `DATABASE_URL` set to a Postgres URL, the app runs against it with no code change.
- [ ] Starting against a fresh Postgres database applies all migrations before the app serves traffic.
- [ ] Restarting against an already-migrated database starts cleanly.

**Depends on.** APP-9 through APP-15 (whatever schema they added).

### APP-21: know what's happening

**Story.** As an operator, I want an anonymous event after each detection attempt, so I can see load times, inference times, and failure rates without any identifying data.

**Scope.** `POST /api/v1/events` accepting load time, inference time, outcome, backend, and model version, called by the frontend after every detection attempt (PLAN_PROJECT.md item 31).

**Acceptance criteria.**
- [ ] A successful detection sends an event with all five fields populated.
- [ ] A failed detection sends an event with `outcome` reflecting the failure, not skipped.
- [ ] Stored events carry no IP address, token, or image data.

**Depends on.** APP-2, APP-3.

### APP-22: age out old data

**Story.** As an operator, I want uploads and their research data deleted after 12 months, so retention matches the stated policy.

**Scope.** A scheduled job deleting uploads, landmarks, ratios, scores, and consent records past 12 months from upload time (PLAN_PROJECT.md item 24).

**Acceptance criteria.**
- [ ] An upload dated 13 months ago is deleted along with its consent record and derived data when the job runs.
- [ ] An upload dated 11 months ago is untouched.
- [ ] Running the job twice in a row deletes nothing new on the second run.

**Depends on.** APP-13.

### APP-23: go live

**Story.** As an operator, I want the app running on the specified AWS instance with its migrations applying automatically, so it's reachable by users.

**Scope.** Provisioning a t3.micro instance with a 2 GB swap file, and a start sequence running APP-20's migrations before serving traffic (PLAN_PROJECT.md item 30).

**Acceptance criteria.**
- [ ] A fresh t3.micro instance ends provisioning with a 2 GB swap file active.
- [ ] Starting against a fresh database on that instance applies migrations before the health check responds successfully.
- [ ] The running app serves APP-1 through APP-16's flows end to end.

**Depends on.** APP-20.

### APP-24: get paged when something breaks

**Story.** As an operator, I want alerts on an elevated no-face rate, model-load failures, and disk usage above 80%, so I find out about problems before users report them.

**Scope.** Alert rules over APP-21's telemetry (no-face rate, model-load failures) and the deployed instance's disk usage (PLAN_PROJECT.md item 32).

**Acceptance criteria.**
- [ ] A synthetic spike in no-face outcomes triggers the no-face alert.
- [ ] A synthetic model-load-failure event triggers its alert.
- [ ] Disk usage crossing 80% on the instance triggers the disk alert.
- [ ] Each alert states which condition fired, not a generic message.

**Depends on.** APP-21, APP-23.
