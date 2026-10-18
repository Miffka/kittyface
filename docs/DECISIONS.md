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
