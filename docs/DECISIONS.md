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

`backend/db.py` holds the engine and three tables: `consents`, `uploads`, `events`. `DATABASE_URL` picks the database and defaults to `sqlite:///kittyface.db` in the working directory. The tables use only portable column types (`String`, `JSON`, `LargeBinary`, `Float`), so Postgres needs a new URL and a driver, with no code change. The one SQLite branch turns off `check_same_thread`, because FastAPI runs sync routes in a threadpool. Each upload stores its `UploadMetadata` in one JSON column, since the API reads and writes it whole. `created_at` stays an ISO-8601 UTC string, so API responses keep their exact format and string order matches time order. The app re-merges the demo seed rows on every start, which makes restarts idempotent; a deleted seed upload comes back on the next start. This entry first created the tables with `create_all`; the APP-20 entry below replaces that with Alembic migrations, and the "Postgres everywhere" entry drops the SQLite default.

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

**Serving the cutoffs.** `backend/store.py` loads `models/thresholds.json` into the `GET /config` response, so a refit reaches the app with no code change. The frontend's mock API keeps a copy in `frontend/src/api/mock.ts`, because Vite's dev server can't load files outside `frontend/`. A test in `mock-api.test.ts` reads the JSON and fails when the copy drifts.

**Whisker/muzzle correlation (PLAN_PROJECT.md item 8).** Across the 13 distinct photos (the script dedupes the manual's reused photos by file hash), `whisker_elevation` and `muzzle_roundness` correlate at Pearson r = -0.41, 95% CI -0.79 to 0.18 (Fisher z), n = 13. The negative sign means raised whisker pads go with a less round, more tense muzzle. The interval includes zero. About-page copy: "On 13 photos from the Feline Grimace Scale training manual, the whisker-pad angle and muzzle roundness correlate at r = -0.41 (95% confidence interval -0.79 to 0.18). The sample is too small to show that the two measurements are related."

## One image, and the backend serves the SPA build

The `Dockerfile` builds one image that runs FastAPI and serves the frontend from the same origin, so the frontend calls `/api/v1` with an empty `VITE_API_BASE_URL` and needs no CORS. TanStack Start renders on the server by default, which would need a Node runtime next to Python. We turned on its SPA mode instead (`spa: { enabled: true }` in `frontend/vite.config.ts`). The build then prerenders one shell, `_shell.html`, into `frontend/.output/public` with the client assets and the ONNX models. Nitro stays on, so the Lovable build works as before.

`backend/main.py` mounts that directory at `/` after the API routes. A path with no file gets the shell, so reloading `/history/<id>` works. Paths under `api/` skip the fallback and return 404, so a typo in an API path doesn't come back as HTML with status 200. `FRONTEND_DIR` overrides the directory, and the backend skips the mount when the directory is missing, so `make backend` and the tests run without a build.

Node runs the Vite build, and bun only installs packages, so the image uses `bun.lock` and `bunfig.toml`'s 24-hour release-age guard. npm would ignore `bun.lock`. The Python stage runs `uv sync --frozen --no-dev --no-install-project`: the backend never imports `src/kittyface`, so the image skips the package and the dev and train groups. The image first kept SQLite on a volume at `/app/data`; since "Postgres everywhere" it holds no database and needs `DATABASE_URL`.

## OpenCV, OpenVINO and NumPy are dev dependencies

The research scripts, `kittyface.core.geometry` and the tests use OpenCV, OpenVINO and NumPy, and the app doesn't, so all three moved from the runtime dependencies to the `dev` group. `uv sync` still installs them locally, so the RSCH-6 export check keeps OpenVINO as its tflite reference with no extra install step. The backend's one OpenCV call encoded the three one-color demo seed PNGs; `backend.store.solid_png` now writes them with `zlib` and `struct`. The seed colors went from OpenCV's BGR order to RGB, so the pictures look the same. Moving OpenCV and OpenVINO took the image from 975 MB to 505 MB, and NumPy took it to 428 MB. Most of what's left is the Python base image and 83 MB of frontend build, mostly the ONNX models the browser downloads; the venv is 31 MB.

## Alembic migrations run on start, Postgres through psycopg (APP-20)

`backend/main.py` runs `alembic upgrade head` at import, before the demo seed, in place of `create_all`. It builds the Alembic `Config` in code with `backend/migrations` as an absolute path, so the image needs no `alembic.ini` and the working directory doesn't matter. The root `alembic.ini` exists only so `uv run alembic ...` works from the repo root. Neither holds a database URL: `backend/migrations/env.py` runs on `backend.db.engine`, so `DATABASE_URL` picks the database for the CLI and the app alike. `env.py` skips Alembic's usual `fileConfig` call, because it would replace uvicorn's log handlers when the app migrates on start. It set `render_as_batch=True` for SQLite's sake until the next entry dropped SQLite.

One baseline revision creates `consents`, `uploads` with its `token` index, and `events`, autogenerated against an empty database and tidied by hand. `tests/backend/test_migrations.py` compares the migrated schema with `Base.metadata` through Alembic's `compare_metadata` and fails on any difference, so a model change without a migration breaks the suite.

Postgres URLs use `postgresql+psycopg://`, with `psycopg[binary]` as a runtime dependency; the binary wheel needs no `libpq` in the image. Databases that `create_all` built have the tables but no `alembic_version`, so the baseline fails on them. We chose not to stamp or detect them: delete such a database once and let the app recreate it. Nothing locks against concurrent migrations, since the image runs one uvicorn process.

## Postgres everywhere, `DATABASE_URL` required

The product owner dropped SQLite, so local runs, tests and production all use the same database. `backend/db.py` reads `DATABASE_URL` with no default, so the app fails at import with `KeyError: 'DATABASE_URL'` instead of connecting to a database nobody chose. The SQLite-only `check_same_thread` branch and `render_as_batch` are gone. The image has no `/app/data` volume, and `make docker-run` went with it. `docker-compose.yaml` publishes Postgres on host port 5433, because another project's Postgres already holds 5432 on the development machine. `make db` starts that service alone.

The tests run against Postgres, with no skipped Postgres test. `tests/backend/conftest.py` creates a `kittyface_test_<hex>` database on the compose Postgres, or on the server `TEST_POSTGRES_URL` names, before `backend.db` is imported. `pytest_sessionfinish` drops it `WITH (FORCE)`, which closes the connections the app's engine still holds. A random name keeps two concurrent runs apart. The upgrade-from-empty path still runs on every session, because importing `backend.main` migrates the new database. The old subprocess Postgres test now checks only that an upload survives a restart.

## Database credentials live in `.env`, from `.example.env`

`.example.env` is the committed template; `.env` holds the real values and is ignored by git and Docker. Every line is `export KEY=value`, which `source .env`, GNU make's `include` and docker compose all parse, so one file feeds the shell, `make` targets and compose. `DATABASE_URL` is built inside the file from `${POSTGRES_USER}`, `${POSTGRES_PASSWORD}` and `${POSTGRES_DB}`, and all three readers expand that. The compose app service builds its own URL from the same variables with the host `db`, and the `db` service uses `${VAR:?}`, so compose fails naming the missing variable instead of starting Postgres with a blank password. `tests/backend/conftest.py` creates its throwaway database on the server `DATABASE_URL` names, so the tests carry no credentials either. We use a hex password, so it needs no URL escaping.

## E2E tests compare the live app with the Python pipeline

`tests/e2e` drives the compose stack in Chromium through `pytest-playwright`. Each test uploads a photo, saves it, and reads the stored record back from `/api/v1/uploads/<id>`, so the checks run on what the service keeps. The golden predictions in `tests/e2e/expected.json` come from `scripts/05_score_image.py --json`, which runs OpenVINO on the tflite models. The browser runs onnxruntime-web on the ONNX exports. A test fails if the two disagree beyond a tolerance, if Python's `kittyface.core.geometry` gives different ratios or scores from the browser's own landmarks (to 1e-6), or if the Measurements table shows something other than the stored record. Further tests cover a dragged landmark, EXIF orientation 6 with the metadata stripped, and the History open and delete flow.

The fixtures in `tests/e2e/fixtures/cats` are the product owner's Pixel photos, scaled to a 1280 px long side and re-encoded without metadata, which drops the GPS tags. `cat1_exif6.jpg` stores `cat1.jpg` turned 90° counterclockwise with a hand-written EXIF orientation 6. `cv2.imread` applies that orientation, so its golden predictions are upright like the browser's.

We set the tolerances from the measured spread on cat1 to cat7: mean landmark error at most 0.35% of the outer-eye-corner distance, max 1.5%, box IoU at least 0.991, ratio differences up to 0.0135 and whisker up to 0.95°. The limits sit at about twice that: 1% mean, 3% max, IoU 0.98, 0.02 for ear, 0.01 for orbital and muzzle, 1.5° for whisker. A test skips the score comparison when the golden ratio lies within the tolerance of a cutoff.

cat8 fails these limits. Its orbital ratio comes out 0.913 in the browser and 0.872 in Python, on either side of the 0.903 cutoff, so the app shows score 0 where Python gives 1. The two pipelines resize differently: `cv2.resize` with `INTER_LINEAR` aliases on a 5.7× downscale, and canvas `drawImage` smooths. cat8 carries a strict `xfail`, so the suite turns red once someone aligns the resizing and the xfail can go.

No test covers "No cat face found". The localizer has no confidence output and returned a box for black, grey, white and noise images, so no real photo reaches that branch.

`docker-compose.yaml` takes `APP_PORT` and `DB_PORT` with the old ports as defaults, so the E2E stack runs beside a dev stack. `make test` skips `tests/e2e` through `norecursedirs`, because the suite needs Docker, a browser and about 75 seconds after the first image build.


## One EC2 instance from CloudFormation, image from ECR, HTTPS on sslip.io (APP-23)

`deploy/cloudformation.yaml` puts the app, Postgres and Caddy in docker compose on one t3.micro with a 2 GB swap file, as PLAN_PROJECT.md item 30 asks. The instance runs in standard CPU credit mode, so a busy period slows it to its baseline instead of adding surplus-credit charges. Postgres runs in compose and not on RDS, so the stack stays at one billable instance. The data lives on the instance's root volume: replacing or terminating the instance deletes every upload, and nothing backs it up yet.

The product owner chose to build the image locally and push it to an ECR repo in the stack. Building the frontend on a 1 GB instance would take minutes of swapping on every deploy. The instance pulls through `amazon-ecr-credential-helper` and its IAM role, so it needs no AWS CLI and no stored credentials. A lifecycle rule keeps 3 images, under the 500 MB free tier.

The product owner wanted HTTPS without buying a domain. `<elastic-ip>.sslip.io` resolves to the Elastic IP, and Caddy gets a Let's Encrypt certificate for it on first start. sslip.io shares Let's Encrypt's rate limits with all its users; a real domain replaces it by changing the `HOST` line in the template.

The shell goes through SSM Session Manager: no key pair, and the security group opens only 80 and 443. `deploy/deploy.sh` also uses SSM to pull the new image and restart compose, and it generates the Postgres password on the instance, so the password never leaves it.
