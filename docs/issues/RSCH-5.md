# RSCH-5 (E5): threshold derivation for the 0-2 proxy scores

Groomed from the [RSCH-5 entry](../backlog.md#rsch-5-e5-threshold-derivation-for-the-0-2-proxy-scores) in `docs/backlog.md`. This file supersedes that entry. Status: delivered, no QA pass yet.

**Problem.** Each FGS action unit needs a 0-2 proxy score, and `geometry.score_au` needs two cutoffs per AU to produce one. Until now the frontend and backend have run on placeholder `mock-thresholds-0.1.0` cutoffs. The cutoffs have to come from labeled data, and every result has to record which cutoff version scored it.

**Data.** `data/fsg/annotations.csv` labels 18 photos from the FGS training manual (`data/fsg/images/`). Ear position, orbital tightening, muzzle tension and whisker change each get one photo per score 0, 1 and 2, and head position gets six. Several manual pages reuse the same photo, which leaves 13 distinct files by sha256. `data/` stays gitignored and local, like the CatFLW fixtures.

**Scope.**
- `scripts/04_fit_thresholds.py` loads `scripts/02_detect_landmarks.py` with `importlib` and runs its detection on every annotated photo. It caches the landmarks in `data/fsg/landmarks.json`, and `--redetect` ignores the cache.
- For each AU, the script uses only the rows labeled with that AU. It takes the mean ratio at each score level and puts each cutoff at the midpoint between adjacent levels. Head position isn't scored.
- The script writes `models/thresholds.json` in the frontend's `Thresholds` shape: `version`, then per unit (`ear`, `orbital`, `muzzle`, `whisker`) `cutoffs` and `direction`. Each unit also gets a `fit` record with the per-level ratios and how many labeled photos the cutoffs score back correctly. The file holds one version, and git history keeps older ones.
- `geometry.score_ratio(value, unit, version, path)` reads the file and returns the 0-2 score through `score_au`, taking the direction from `AU_SCORE_RISES`. It raises if the file holds a different version. The `AU_SCORE_RISES` keys change to the frontend's unit keys.
- The script reports Pearson r between `whisker_elevation` and `muzzle_roundness` across the distinct photos, with a 95% Fisher-z interval, for the About page (PLAN_PROJECT.md item 8).
- `scripts/05_score_image.py` takes image files or folders, runs detection, and writes each image with its landmarks, every AU's ratio and score, and the threshold version drawn on. The product owner added this during planning, for checking the fit by eye.
- Fix `ROOT` in `scripts/02_detect_landmarks.py`, which resolved to `scripts/` and could not find `models/manifest.json`.

**Acceptance criteria.**
- [x] `models/thresholds.json` exists, has a version field, and has one cutoff set per AU (ear position, orbital tightening, muzzle tension, whisker change). Version `fgs-manual-1.0.0`, and `test_committed_thresholds_cover_every_au` checks the units against `AU_SCORE_RISES`.
- [x] Given a ratio value and a threshold version, a function (reading cutoffs into `geometry.score_au`, direction from `AU_SCORE_RISES`) returns the correct 0-2 score for values at, just below, and just above each cutoff. `test_score_ratio_boundaries` covers a rising unit (ear) and a falling one (muzzle), and `test_score_ratio_rejects_other_version` covers a version mismatch.
- [x] The whisker/muzzle correlation number is written down somewhere `docs/AI_WORKFLOW.md` or a linked note can point the About-page copy at. It's in [DECISIONS.md](../DECISIONS.md#fgs-proxy-cutoffs-come-from-the-fgs-training-manual-version-fgs-manual-100-rsch-5), with the About-page sentence, and AI_WORKFLOW.md links there.
- [x] Re-scoring the same landmarks against a new threshold version does not require re-running detection. `score_ratio` takes a ratio, not an image, and `test_rescoring_stored_landmarks_needs_no_detection` scores one landmark set against two versions. A second run of script 04 reads the landmark cache and writes a byte-identical `models/thresholds.json`.

**Depends on.** Nothing outstanding.

**Out of scope.**
- Better orbital and whisker metrics. See the notes below.

**Engineer notes.**

| AU | Ratio at score 0 / 1 / 2 | Cutoffs | Agreement |
|---|---|---|---|
| ear | 1.601 / 1.826 / 2.183 | 1.713, 2.005 | 3/3 |
| orbital | 0.900 / 0.907 / 0.576 | 0.741, 0.903 | 1/3 |
| muzzle | 0.455 / 0.384 / 0.369 | 0.377, 0.419 | 3/3 |
| whisker | 16.4° / 25.9° / 16.5° | 21.14°, 21.17° | 1/3 |

- Orbital separates score 2 but swaps scores 0 and 1, which sit 0.007 apart. Whisker scores its score-2 photo at the same angle as its score-0 photo, and its two cutoffs sit 0.03° apart, so in practice a whisker score is 0 or 2. All four AUs stay scoreable. DECISIONS.md flags orbital and whisker as weak on this data.
- Whisker/muzzle correlation: r = -0.41, 95% CI -0.79 to 0.18, n = 13. The interval includes zero.
- Midpoints between single-photo means are the most this data supports. The code carries a `ponytail:` note to switch to ordinal regression once more labeled photos exist.
- Follow-up at the product owner's request: the app now serves these cutoffs instead of `mock-thresholds-0.1.0`. `backend/store.py` loads `models/thresholds.json` for `GET /config`. `frontend/src/api/mock.ts` holds a copy, guarded by a sync test in `mock-api.test.ts`. The demo seed ratios moved so the three seed uploads still score all 0, all 1 and all 2. See [APP-8](APP-8.md) and [APP-26](APP-26.md).
- Tests: `uv run pytest` reports 20 passed and `bun --bun run test` 24 passed. `ruff check`, `mypy` and `tsc` are clean. No QA pass ran.
