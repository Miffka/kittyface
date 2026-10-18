# AI workflow log

## RSCH-6: tflite to ONNX export (2026-09-28)

- Orchestrator (main session) planned the run with the product owner. Decisions taken up front: tf2onnx + tensorflow-cpu in a new `train` group, OpenVINO as the tflite reference runtime, one script in `scripts/` that exports, simplifies and checks in a single call, and CatFLW images as local-only fixtures that are never committed.
- PM subagent groomed the task into [issues/RSCH-6.md](issues/RSCH-6.md). The product owner rejected the in-place backlog rewrite and the drafted follow-up issues during grooming, so the groomed issue lives in its own file and has no out-of-scope list.
- Engineer subagent implemented it in four commits. tf2onnx names nodes differently on every run, which broke the "second run leaves the manifest unchanged" criterion; the engineer fixed it by renaming internal tensors by position before hashing. The product owner rejected the first test file, and the engineer rewrote it around a real output perturbation instead of a tolerance tuned to sit just below the measured divergence.
- QA subagent passed all 12 criteria on the first round. Gaps it noted: the tests cover only the localizer, and nothing runs `main()` on real fixtures.
- Open: APP-19 still assumes committed fixtures, but CatFLW images can't be committed, so CI needs redistributable photos before APP-19 can pass.

## Retrospective tickets for the built app (2026-10-18)

- The Lovable frontend and the FastAPI backend landed before any APP issue was groomed. The PM role read `docs/backlog.md` against `frontend/` and `backend/` and wrote one ticket per built feature in `docs/issues/`: APP-1 to APP-15, APP-20, APP-21, plus APP-25 to APP-27 for features the backlog never named.
- Each ticket records what shipped. Gaps against the backlog criteria sit under out-of-scope and link back to the open backlog entry, which stays the home of the remaining work. APP-16, 17, 18, 19, 22, 23 and 24 have no code and no ticket.
- Open for the product owner: APP-1 conflicts with the shipped responsive app (no phone notice); APP-4 re-runs detection on an unchanged box; APP-10 strips and rotates only in the browser; APP-26's seed runs in every environment.
- No QA pass ran. Ticked criteria come from reading the code and the existing tests, not from running them.

## RSCH-5: proxy-score cutoffs (2026-10-18)

- The main session planned and implemented RSCH-5 directly at the product owner's request, with no PM, Engineer or QA subagents. A read-only dry run on the FGS manual photos showed orbital and whisker out of order before any code got written. The product owner chose one version per thresholds file and asked for an extra script, `scripts/05_score_image.py`, that draws the ratios and scores onto each photo.
- Issue: [issues/RSCH-5.md](issues/RSCH-5.md). The main session wrote it after implementing, so no PM grooming preceded the work.
- Delivered: `scripts/04_fit_thresholds.py`, `models/thresholds.json` (`fgs-manual-1.0.0`), `geometry.score_ratio`, its tests in `tests/test_geometry.py`, and a fix to `scripts/02_detect_landmarks.py`'s `ROOT`, which pointed into `scripts/`. `AU_SCORE_RISES` now uses the frontend's unit keys (`ear`, `whisker`).
- The fit, the per-AU agreement and the whisker/muzzle correlation (r = -0.41, n = 13), with its About-page wording, are in [DECISIONS.md](DECISIONS.md#fgs-proxy-cutoffs-come-from-the-fgs-training-manual-version-fgs-manual-100-rsch-5).
- Follow-up at the product owner's request: the app now serves `fgs-manual-1.0.0`. `backend/store.py` loads `models/thresholds.json`, the frontend mock holds a copy guarded by a sync test, and the demo seed ratios moved to still score 0, 1 and 2.
- Open: orbital (1/3) and whisker (1/3) need better metrics or more labeled photos.

## Docker image for the app (2026-10-18)

- The main session planned and implemented the image directly at the product owner's request, with no PM, Engineer or QA subagents and no issue file. The work prepares APP-23 but doesn't deliver it: provisioning, swap and migrations stay open.
- Delivered in four commits: SPA mode for the frontend build, static serving with a shell fallback in `backend/main.py` plus `tests/backend/test_frontend.py`, the `Dockerfile` and `.dockerignore`, and these docs.
- The first fallback caught `fastapi.HTTPException`, which subclasses Starlette's, so Starlette's 404 slipped past it. The new test caught it before the commit.
- Checked by hand: `docker build` and `docker run`, then curl against `/`, `/history/x`, `/api/v1/config`, `/api/v1/nope`, a `.wasm` asset (served as `application/wasm`) and an ONNX model. Nobody has clicked through the app in a browser against the container yet.
- Decision record: [DECISIONS.md](DECISIONS.md#one-image-and-the-backend-serves-the-spa-build).
- Follow-up at the product owner's request: OpenCV and OpenVINO moved to the `dev` group, and `backend/store.py` encodes the seed PNGs with the standard library, so the image went from 975 MB to 505 MB. A decode test in `tests/backend/test_api.py` checks the hand-written encoder against OpenCV. A rebuilt container served the same curl checks plus a seed image. Running plain `uv sync` removed the locally installed `train` group, and the export test skipped until `uv sync --group train --group dev` put it back.
- Second follow-up: NumPy moved to `dev` too, since the backend no longer imports it. The image is now 428 MB, and the same container checks pass.
- Decision record: [DECISIONS.md](DECISIONS.md#opencv-openvino-and-numpy-are-dev-dependencies).

## APP-20: move off SQLite (2026-10-18)

- The main session ran the full lifecycle as orchestrator. The PM subagent re-groomed [issues/APP-20.md](issues/APP-20.md) with the product owner's decisions: `psycopg[binary]` as a new runtime dependency, and no upgrade path for databases that `create_all` built.
- Engineer subagent implemented it in commits for the dependency, the Alembic environment and baseline revision, migrate-on-start with `tests/backend/test_migrations.py`, and the docs.
- Checked by hand against `postgres:17` in Docker: the backend tests with `TEST_POSTGRES_URL` set, two uvicorn starts from `/tmp` against a fresh database, and the app image saving an upload, listing it, and listing it again after `docker restart`. Uvicorn's logs stayed intact.
- QA subagent passed all 16 criteria against `postgres:17` and the built image. To confirm the drift test catches drift, it added a column to the `Event` model in a scratch copy of the repo, and the test failed.
- Mistake: an ad-hoc check imported `tests.backend.test_api` without `DATABASE_URL`, so the app migrated the repo's own `kittyface.db`. The baseline failed on the existing tables, but SQLite had already committed an empty `alembic_version` table into that file. Uploads and consents are untouched. The file needs the delete-once step from `backend/README.md` either way.
- Decision record: [DECISIONS.md](DECISIONS.md#alembic-migrations-run-on-start-postgres-through-psycopg-app-20).

## Docker Compose with Postgres (2026-10-18)

- The main session added `docker-compose.yaml` and the `make docker-up`/`docker-down` targets directly at the product owner's request, with no issue file. The app service builds the image and waits for a `postgres:17` service's health check, so the app migrates a ready database. `make docker-run` stays as the SQLite option.
- Checked by hand: `docker compose up --build`, then `/api/v1/config` and `/` returned 200, `alembic_version` was at `62b6185e1c34`, and the database held the 3 seed uploads. A consent posted for a new token was still in the database after `docker compose restart app`. `docker compose down -v` cleaned up.

## Postgres everywhere (2026-10-18)

- The main session removed SQLite directly at the product owner's request, with no issue file. The product owner chose to make `DATABASE_URL` required, to run the tests on the compose Postgres, and to update `PLAN_PROJECT.md` item 28. History entries, delivered issue files and `docs/backlog.md` still say SQLite, as they did at the time.
- Port 5432 was taken by another project's container, so the compose `db` service publishes 5433.
- Checked: `uv run pytest` gave 29 passed and 0 skipped, with no `kittyface_test_*` database left behind. Importing the app without `DATABASE_URL` fails with `KeyError`. `docker compose up --build` served `/` and `/api/v1/config` with 200, migrated to `62b6185e1c34` and wrote the 3 seed uploads.

## Credentials in `.env` (2026-10-18)

- The main session added `.example.env` and wired compose, the Makefile and the tests to `.env` directly at the product owner's request. The existing `.env` already held AWS credentials, so the session appended the database block without printing or overwriting them, with a generated hex password.
- The `kittyface-pg` volume had been created with the old hard-coded password, and Postgres ignores `POSTGRES_PASSWORD` on an existing volume, so the session ran `ALTER USER` to match `.env`. The old password is refused now.
- Checked: `make test` gave 29 passed. `source .env` connects. `docker compose up --build` served `/api/v1/config` with 200. Without `.env`, `docker compose config` fails naming each missing variable.


## E2E tests with Playwright (2026-10-18)

- The main session planned and built `tests/e2e` directly at the product owner's request, with no issue file. The first plan proposed HTTP-only integration tests. The product owner rejected it in favour of Playwright tests that compare the live app with the Python pipeline, picked `pytest-playwright`, and supplied the photos.
- The supplied photos carried GPS tags and weighed 1.5 to 3.7 MB each. The session wrote metadata-free 1280 px copies to `tests/e2e/fixtures/cats` and left the originals in `tests/e2e/fixtures` uncommitted.
- A probe run measured the browser-vs-Python spread per image before the session set any tolerance. It found the cat8 resize mismatch and showed that the localizer finds a "face" in blank images. Both are recorded in DECISIONS.md.
- Checked: `make test-e2e` gave 12 passed and 1 xfailed in 75 s, with no `kittyface-e2e` volume left behind. `make test` gave 29 passed and collected nothing from `tests/e2e`.

## APP-23: deploy to AWS (2026-10-18)

- The main session planned APP-23 at the product owner's request and implemented it directly, without the PM, Engineer and QA subagents. The product owner picked ECR over building on the instance, HTTPS on a free sslip.io hostname and SSM over SSH.
- The session installed AWS CLI v2 into `~/.local`. `.env` holds `AWS_USER` and `AWS_ACCESS_KEY` but no secret key under the names the CLI reads, so the product owner configures the CLI with `aws configure`.
- Checked before any deploy: `cfn-lint` passes on the template and `bash -n` on `deploy/deploy.sh`.
