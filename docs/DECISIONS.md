# Decisions

## OpenVINO runs the tflite reference in the ONNX export check (RSCH-6)

`scripts/03_export_onnx.py` compares each ONNX export against the tflite original run through OpenVINO, the runtime `scripts/02_detect_landmarks.py` already uses. OpenVINO is a runtime dependency, so the check needs no second tflite interpreter, and it validates the ONNX file against the same outputs the app pipeline has produced so far. TensorFlow's `tf.lite.Interpreter` is deprecated and only arrives with the `train` group.

## ONNX export tolerance: 1e-4 normalized, measured basis (RSCH-6)

The check fails when any raw output element differs by more than 1e-4 in normalized [0, 1] units: 0.022 px on the 224 px localizer input and 0.038 px on the 384 px landmark crop. On the five CatFLW fixtures (tf2onnx 1.17.0, TensorFlow 2.21.0, onnxruntime 1.30.0, OpenVINO 2026.4.0) the largest divergence was 1.8e-7 for `cat_face_localizer` and 2.3e-5 for `cat_face_landmarks_full`. The tolerance gives about 4x headroom over the worst model and stays two orders of magnitude under a pixel. If a dependency upgrade pushes divergence past it, re-measure before raising it.

## CatFLW images stay local-only fixtures (RSCH-6)

The export check runs on five CatFLW photos in `data/catflw/images/`. We have no redistribution rights for them, so `.gitignore` excludes `data/` and nothing under it gets committed. Tests that need the photos skip with a stated reason when the directory is missing or empty, and `scripts/03_export_onnx.py` exits non-zero naming the path.

## In-memory backend for the frontend (`backend/`)

`backend/` implements `openapi.yaml` with FastAPI and module-level dicts, so all state is lost on restart. Auth follows the spec: the anonymous `X-Client-Token` header plus the consent gate, with no accounts or passwords. Seed uploads belong to `DEMO_TOKEN` (32 zeros), which is pre-consented; set the frontend's localStorage token to it to see them. A 422 body names the first failing metadata field, or `notice_version`. Rate limiting (429) is not implemented, since the client works without it. The next entry replaces the dicts with a database.

## SQLAlchemy storage, chosen by `DATABASE_URL` (`backend/`)

`backend/db.py` holds the engine and three tables: `consents`, `uploads`, `events`. `DATABASE_URL` picks the database and defaults to `sqlite:///kittyface.db` in the working directory. The tables use only portable column types (`String`, `JSON`, `LargeBinary`, `Float`), so Postgres needs a new URL and a driver, with no code change. The one SQLite branch turns off `check_same_thread`, because FastAPI runs sync routes in a threadpool. Each upload stores its `UploadMetadata` in one JSON column, since the API reads and writes it whole. `created_at` stays an ISO-8601 UTC string, so API responses keep their exact format and string order matches time order. The app calls `create_all` at import and re-merges the demo seed rows, which makes restarts idempotent; a deleted seed upload comes back on the next start. Alembic migrations stay with APP-20.

## FGS action-unit metrics read named landmarks (RSCH-2 redo)

The first RSCH-2 readouts guessed point roles: farthest eye points, nearest and farthest ear points, the widest muzzle span. The legend in `models/graph_edge_schemes/graph_edges_manual_v2.txt` names all 48 points, so `kittyface.core.geometry` now builds each AU from the points the FGS manual describes. **Ears:** `ear_spread_ratio` divides the ear-tip span (24, 29) by the outer-eye-corner span (4, 8). Both spans are bilateral, so yaw scales them by the same `|cos θ|` and pitch leaves them alone. **Orbital tightening:** `eye_opening_ratio` averages eyelid top-bottom over outside-inside for both eyes and ignores the pupil points, since dilation is not tightening; yaw inflates it by `1/|cos θ|`. **Muzzle tension:** `muzzle_roundness` takes the minor/major ratio of the second-moment ellipse of the ring (12, 13, 35, 47, 19, 2, 21, 46, 32): 1 for round, lower for elliptic. We chose moments over `cv2.fitEllipse` to keep the APP-7 TypeScript port short; pitch and yaw both distort it. **Whisker change:** `whisker_elevation` measures the angle from each muzzle side (33→46, 34→47) to its whisker pad (42→32, 43→35), mirrored so upward reads positive, averaged over both sides. Head roll cancels out of it. The five CatFLW cats read +2° to +24°, so "level with the muzzle" does not sit at 0° and the cutoffs have to place it. `score_au` turns a metric into 0-2 from two cutoffs, and `AU_SCORE_RISES` records that ears and whiskers score up while eyes and muzzle score down. No FGS-scored data exists in the repo, so RSCH-5 still owns the cutoff values.

## FGS proxy cutoffs come from the FGS training manual, version `fgs-manual-1.0.0` (RSCH-5)

`scripts/04_fit_thresholds.py` fits the cutoffs in `models/thresholds.json` from the 18 rows in `data/fsg/annotations.csv`: one FGS training-manual photo per score level per action unit, plus six head-position rows. For each AU it takes the mean ratio at score 0, 1 and 2 and places each cutoff at the midpoint between adjacent levels. With one photo per level, nothing better is possible, and the rule should become an ordinal regression once more labeled photos exist. The file keeps the frontend's `Thresholds` shape (`version`, then `cutoffs` and `direction` per unit) and adds a `fit` record of the per-level ratios and how many labeled photos the cutoffs score back correctly. It holds one version, and git history keeps older ones. `geometry.score_ratio` refuses a version the file doesn't hold. Uploads store their ratios and the threshold version, so a new version rescores them without re-running detection. The script caches landmarks in `data/fsg/landmarks.json` for the same reason.

| AU | Ratio at score 0 / 1 / 2 | Cutoffs | Agreement |
|---|---|---|---|
| ear (`ear_spread_ratio`, rises) | 1.601 / 1.826 / 2.183 | 1.713, 2.005 | 3/3 |
| orbital (`eye_opening_ratio`, falls) | 0.900 / 0.907 / 0.576 | 0.741, 0.903 | 1/3 |
| muzzle (`muzzle_roundness`, falls) | 0.455 / 0.384 / 0.369 | 0.377, 0.419 | 3/3 |
| whisker (`whisker_elevation`, rises) | 16.4° / 25.9° / 16.5° | 21.14°, 21.17° | 1/3 |

Ears and muzzle order their three photos correctly. Orbital separates score 2 but swaps scores 0 and 1, which sit 0.007 apart. Whisker has no usable signal on this data: the score-2 photo reads the same angle as the score-0 photo, and the two cutoffs sit 0.03° apart, so in practice the whisker score is 0 or 2. We kept all four AUs scoreable and flag orbital and whisker as weak here. `scripts/05_score_image.py` draws each photo's ratios and scores onto it, for checking these two by eye.

**Whisker/muzzle correlation (PLAN_PROJECT.md item 8).** Across the 13 distinct photos (the script dedupes the manual's reused photos by file hash), `whisker_elevation` and `muzzle_roundness` correlate at Pearson r = -0.41, 95% CI -0.79 to 0.18 (Fisher z), n = 13. The negative sign means raised whisker pads go with a less round, more tense muzzle. The interval includes zero. About-page copy: "On 13 photos from the Feline Grimace Scale training manual, the whisker-pad angle and muzzle roundness correlate at r = -0.41 (95% confidence interval -0.79 to 0.18). The sample is too small to show that the two measurements are related."
