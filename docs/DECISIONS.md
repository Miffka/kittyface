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
