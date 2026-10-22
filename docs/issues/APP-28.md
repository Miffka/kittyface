# APP-28: test and deploy on every push

Groomed from the [APP-28 entry](../backlog.md#app-28-test-and-deploy-on-every-push). This file supersedes that entry.

**Story.** As an operator, I want every push tested and every passing push to `main` deployed and checked, so a broken build never reaches users and a deploy never needs my laptop.

**Problem.** The repo at github.com/Miffka/kittyface has no `.github/` directory. Tests run only on the product owner's machine, and `make deploy` (APP-23, [issues/APP-23.md](APP-23.md)) runs with the AWS keys from `aws configure`. The product owner asked for a pipeline that runs the backend and frontend tests in parallel, builds the Docker Compose stack and runs the integration and end-to-end tests against it, deploys to AWS through a GitHub OIDC role, and checks the deploy through the health endpoint. The app has no health route yet: APP-23 and `tests/e2e/conftest.py` poll `/api/v1/config`.

What the tests need today:
- `tests/test_geometry.py` is pure Python. `tests/backend/` runs FastAPI's `TestClient` against Postgres: `tests/backend/conftest.py` creates a throwaway database on the server `DATABASE_URL` names. These are the integration tests. `make test` runs both and skips `tests/test_export_onnx.py` without the `train` group.
- `tests/e2e/` (`make test-e2e`) builds the image, starts the compose stack as project `kittyface-e2e` on port 18091, and drives it in Chromium through `pytest-playwright`. It needs Docker, `uv run playwright install chromium`, and the ONNX models in `frontend/public/models/`, which the `Dockerfile` copies into the image.
- The model files (`*.onnx`, `*.tflite`) live in git LFS (`.gitattributes`), about 85 MB per full pull. A checkout without LFS leaves pointer files, and the image builds fine but serves broken models.
- `docker-compose.yaml`, `make` and the tests read `POSTGRES_*` and `DATABASE_URL` from `.env`; `cp .example.env .env` gives working values for a CI runner.
- `frontend/` tests run with `bun --bun run test` (vitest) and read `../models/thresholds.json`, a plain git file. The `Dockerfile` pins bun 1.4.3.

**Scope.**
- `GET /api/v1/health` in `backend/routers.py`: no token, no consent, runs `SELECT 1` through the `get_session` dependency and returns 200 with `{"status": "ok"}`. A failing query gives a non-2xx response. Add the path to `openapi.yaml`. Tests go in `tests/backend/test_api.py`.
- One workflow, `.github/workflows/ci.yaml`, triggered on `push` to any branch and on `pull_request`. Top-level `permissions: contents: read`. Pin every third-party action to a full commit SHA with the version in a trailing comment.
- Job `backend`: checkout without LFS, `astral-sh/setup-uv` with its cache on, `cp .example.env .env`, `make db`, `make test`.
- Job `frontend`: checkout without LFS, bun 1.4.3, `bun install --frozen-lockfile` and `bun --bun run test` in `frontend/`.
- Job `e2e`, with `needs: [backend, frontend]`: checkout with LFS, uv, `cp .example.env .env`, `uv run playwright install --with-deps chromium`, `make test-e2e`. Waiting for the fast jobs keeps a broken push from spending LFS bandwidth and a 75-second image build.
- Job `deploy`, with `needs: [backend, frontend, e2e]` and `if: github.event_name == 'push' && github.ref == 'refs/heads/main'`. Job-level `permissions: id-token: write, contents: read`. `concurrency: { group: deploy, cancel-in-progress: false }`, so two pushes deploy one after the other and a running deploy is never cut off. `timeout-minutes: 30`, because `deploy.sh` waits for SSM in an unbounded loop. No `environment:` key: an environment changes the token's `sub` claim and breaks the role's trust condition. Steps: checkout with LFS, `aws-actions/configure-aws-credentials` with `role-to-assume: ${{ vars.AWS_ROLE_ARN }}` and `aws-region: ${{ vars.AWS_REGION }}`, then `./deploy/deploy.sh` with `SKIP_STACK=1`, then the health check. If `vars.AWS_ROLE_ARN` is empty, the job fails with a message naming the variable and pointing to `backend/README.md`.
- `deploy/deploy.sh`: with `SKIP_STACK=1` it skips `aws cloudformation deploy` and does the rest (read the stack outputs, push the image, restart compose over SSM). Without it, the script behaves as it does now, so `make deploy` keeps working for the operator.
- Health check step: read the `Url` output of the `kittyface` stack with `aws cloudformation describe-stacks`, then request `<Url>/api/v1/health` with retries for up to 5 minutes (for example `curl -fsS --retry 30 --retry-delay 10 --retry-all-errors`). The retries cover the app's start-up migrations and, on a first deploy, Caddy's wait for its Let's Encrypt certificate. A non-2xx response or a TLS error after the last retry fails the job. Never hard-code the IP or hostname.
- `deploy/github-oidc.yaml`, a separate CloudFormation template the operator applies once with admin credentials. The pipeline can't create its own trust, and keeping the role out of the app stack means `deploy.sh` never needs to change it. It holds:
  - The GitHub OIDC provider for `https://token.actions.githubusercontent.com` with audience `sts.amazonaws.com`. An AWS account allows one provider per URL, so a parameter `ExistingProviderArn` (default empty) reuses an existing one and a condition creates the provider only when it is empty.
  - A role whose trust policy allows `sts:AssumeRoleWithWebIdentity` only when `token.actions.githubusercontent.com:aud` equals `sts.amazonaws.com` and `token.actions.githubusercontent.com:sub` equals `repo:Miffka/kittyface:ref:refs/heads/main` (`StringEquals`, no wildcards). Parameters `Repo` (default `Miffka/kittyface`) and `AppStack` (default `kittyface`) feed the conditions and resource ARNs.
  - Permissions for what `deploy.sh` does with `SKIP_STACK=1` and nothing more: `cloudformation:DescribeStacks` on the `AppStack` stack, `ecr:GetAuthorizationToken` on `*`, push actions on the `AppStack` ECR repository only, `ssm:SendCommand` on the `AWS-RunShellScript` document and on instances tagged `aws:cloudformation:stack-name` = `AppStack`, and `ssm:GetCommandInvocation`. No IAM permissions and no `cloudformation:*` writes.
  - An output with the role ARN.
- `backend/README.md`, "Deploy to AWS": a subsection on the pipeline with the one-time operator setup: run `make deploy` once so the app stack exists, deploy `deploy/github-oidc.yaml` with the exact `aws cloudformation deploy ... --capabilities CAPABILITY_IAM` command (leave the role unnamed so `CAPABILITY_IAM` suffices), set the repo variables `AWS_ROLE_ARN` (from the stack output) and `AWS_REGION` under Settings > Secrets and variables > Actions > Variables, and note that template changes still go through a local `make deploy`. Add one line to `backend/AGENTS.md` naming the workflow file and what runs on `main`.
- `docs/DECISIONS.md` entries: the pipeline deploys the image only and leaves the stack to the operator; the OIDC role lives in its own template, trusted for `main` only; the health route checks the database.
- A `docs/AI_WORKFLOW.md` entry for the delivery.

**Acceptance criteria.**

Checkable locally:
- [ ] `uv run pytest tests/backend/test_api.py` passes and includes a test that `GET /api/v1/health` returns 200 and `{"status": "ok"}` without an `X-Client-Token` header, and a test that it returns a non-2xx status when the database query fails (for example with `app.dependency_overrides` on `get_session`).
- [ ] `make test` passes as a whole.
- [ ] `openapi.yaml` lists `/health` under the same server prefix as `/config`.
- [ ] `actionlint .github/workflows/ci.yaml` reports nothing (the binary or `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest`).
- [ ] In the workflow file, `backend` and `frontend` have no `needs`, `e2e` has `needs: [backend, frontend]`, and `deploy` has `needs: [backend, frontend, e2e]`.
- [ ] `deploy` carries the `if:` on `push` and `refs/heads/main`, `permissions` with `id-token: write`, the `deploy` concurrency group with `cancel-in-progress: false`, `timeout-minutes`, and no `environment:` key. The top-level `permissions` is `contents: read` alone.
- [ ] The `e2e` and `deploy` checkouts set `lfs: true`; the `backend` and `frontend` checkouts don't.
- [ ] `grep -rniE 'aws_access_key|aws_secret|secrets\.' .github/` returns nothing.
- [ ] Every `uses:` line references a 40-character commit SHA.
- [ ] The health check step reads `Url` from `describe-stacks`, calls `/api/v1/health` with a retry window of at least 5 minutes, and fails on a non-2xx response after the last retry. Point at the `curl` flags or loop.
- [ ] `uvx cfn-lint deploy/github-oidc.yaml deploy/cloudformation.yaml` reports nothing.
- [ ] The trust policy in `deploy/github-oidc.yaml` uses `StringEquals` on both `aud` and `sub`, with `sub` resolving to `repo:Miffka/kittyface:ref:refs/heads/main` under the default parameters.
- [ ] The role's policy has no `iam:` actions, no `cloudformation:` action other than `DescribeStacks`, and no `Resource: "*"` except on `ecr:GetAuthorizationToken`.
- [ ] `bash -n deploy/deploy.sh` passes, and with `SKIP_STACK=1` the script reaches no `aws cloudformation deploy` call (read the script, or run it with `aws` stubbed by a shell function that logs its arguments).
- [ ] `backend/README.md` lists the one-time setup steps in order: `make deploy`, the OIDC stack, the two repo variables.
- [ ] `docs/DECISIONS.md` has the three entries listed in scope.

Checkable only on a real run (the product owner checks these after the operator setup):
- [ ] A push to a non-main branch runs `backend`, `frontend` and `e2e`, and the run shows `deploy` as skipped.
- [ ] The run graph shows `backend` and `frontend` starting at the same time, and `e2e` starting after both finish.
- [ ] A push to `main` with passing tests runs `deploy`, which assumes the role through OIDC and ends with a 2xx from `https://<elastic-ip>.sslip.io/api/v1/health`.
- [ ] A failing test in any test job leaves `deploy` unrun.
- [ ] A pull request from a fork runs the test jobs and no `deploy`.
- [ ] With `AWS_ROLE_ARN` unset, `deploy` fails with the message naming the variable.

**Out of scope.**
- Applying changes to `deploy/cloudformation.yaml` from the pipeline. It needs IAM permissions the deploy role shouldn't hold. Filed as [APP-29](../backlog.md#app-29-apply-infrastructure-changes-from-the-pipeline).
- Restoring the previous image when the health check fails. The job goes red and the site stays on whatever compose is running. Filed as [APP-30](../backlog.md#app-30-roll-back-a-failed-deploy).
- Deploying the exact image the `e2e` job tested. `deploy.sh` rebuilds from the same commit, so the pushed image is a second build. Filed as [APP-31](../backlog.md#app-31-ship-the-image-the-tests-passed).
- A local `make deploy` running at the same time as a pipeline deploy. The concurrency group covers pipeline runs only; the README note covers the operator.

**Depends on.** APP-23 (the stack and `deploy/deploy.sh`), and the operator's one-time setup before the first pipeline deploy.
