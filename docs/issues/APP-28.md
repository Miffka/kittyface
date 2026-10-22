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

**Comment on an acceptance criterion.** "The role's policy has no `Resource: "*"` except on `ecr:GetAuthorizationToken`" can't hold as written. `deploy.sh` polls `ssm get-command-invocation`, and the [AWS service reference](https://servicereference.us-east-1.amazonaws.com/v1/ssm/ssm.json) lists no resource types for `ssm:GetCommandInvocation`, so IAM only grants it with `Resource: "*"`. The template gives `"*"` to `ecr:GetAuthorizationToken` and `ssm:GetCommandInvocation`, both read-only, and scopes everything else. QA should read the criterion as allowing both.

**Engineer notes.**

- `GET /api/v1/health` in `backend/routers.py` runs `SELECT 1` through `get_session` and returns `{"status": "ok"}`; a failed query raises, so the app answers 500. `openapi.yaml` lists `/health` under the `/api/v1` server with `security: []`. Two tests in `tests/backend/test_api.py`: 200 without a token, and 500 with `get_session` overridden to a session on `127.0.0.1:1`, which refuses connections.
- `.github/workflows/ci.yaml` has the four jobs and the graph the scope asks for. Actions are pinned to the SHAs of `actions/checkout` v7.0.1, `astral-sh/setup-uv` v10.3.2, `oven-sh/setup-bun` v2.2.0 and `aws-actions/configure-aws-credentials` v6.3.0, all lightweight tags read with `git ls-remote`. The deploy job's first step fails with an `::error::` naming `AWS_ROLE_ARN` and `backend/README.md` when the variable is empty. The health check is `curl -fsS --retry 30 --retry-delay 10 --retry-all-errors "$url/api/v1/health"` with `$url` read from the `Url` output of `describe-stacks`: `-f` turns a non-2xx into an error, and 30 retries 10 s apart give a window of at least 300 s.
- `deploy/deploy.sh` skips `aws cloudformation deploy` when `SKIP_STACK=1` and runs as before otherwise.
- `deploy/github-oidc.yaml` holds the conditional provider, the role with `StringEquals` on `aud` and `sub`, and its policy. `ssm:SendCommand` is split into two statements, one on the `AWS-RunShellScript` document and one on instances with `ssm:resourceTag/aws:cloudformation:stack-name` = `AppStack`, because a tag condition in one statement would also apply to the untagged document. The push actions are the five `docker push` needs.
- Docs: a "Deploy from GitHub Actions" subsection in `backend/README.md`, one line in `backend/AGENTS.md`, three `docs/DECISIONS.md` entries and a `docs/AI_WORKFLOW.md` entry.
- Verified locally:
  - `uv run pytest tests/backend/test_api.py`: 12 passed. `make test`: 31 passed.
  - `bun --bun run test` in `frontend/`: 24 passed.
  - `make test-e2e`: 12 passed, 1 xfailed (cat8, as before).
  - actionlint 1.7.12 (release binary) on `.github/workflows/ci.yaml`: no output.
  - `uvx cfn-lint deploy/github-oidc.yaml deploy/cloudformation.yaml`: no output.
  - `grep -rniE 'aws_access_key|aws_secret|secrets\.' .github/`: no match. Every `uses:` line matches `@[0-9a-f]{40}`.
  - `bash -n deploy/deploy.sh` passes. With `aws` and `docker` stubbed as exported shell functions that log their arguments, `SKIP_STACK=1` produced only `describe-stacks`, ECR and SSM calls; without it the log starts with `aws cloudformation deploy`.
- Not verified: anything on GitHub Actions or AWS, which covers the "real run" criteria, whether the OIDC role can assume and push, and whether `ssm:resourceTag/aws:cloudformation:stack-name` matches the instance's tag in practice. `ruff format --check` flags `tests/test_export_onnx.py` and `tests/test_geometry.py`, which this issue didn't touch.

## QA: PASS

- [x] `uv run pytest tests/backend/test_api.py` passes and includes the health tests (200 and `{"status": "ok"}` without a token; non-2xx when the query fails) - PASS. With `.env` exported: 12 passed, including `test_health_needs_no_token` and `test_health_fails_without_database` (500 via `app.dependency_overrides[get_session]`). Run bare, without `.env` in the environment, `tests/backend/conftest.py` raises `KeyError: 'DATABASE_URL'`; that conftest predates this issue (a882eb2) and `make test` loads `.env`. Against a running `uvicorn` on port 18777: `GET /api/v1/health` with no token gave 200 `{"status":"ok"}`; after `docker stop kittyface-db-1` it gave 500 and `curl -f` exited 22; after `docker start` it gave 200 again.
- [x] `make test` passes as a whole - PASS. 31 passed.
- [x] `openapi.yaml` lists `/health` under the same server prefix as `/config` - PASS. Both sit under `paths:` with the single server `{baseUrl}/api/v1`; `/health` has `security: []`.
- [x] `actionlint .github/workflows/ci.yaml` reports nothing - PASS. actionlint 1.7.12 release binary (tarball sha256 matches the release's `checksums.txt`): no output, exit 0.
- [x] Job graph: `backend` and `frontend` have no `needs`, `e2e` needs both, `deploy` needs all three - PASS. Read in the file.
- [x] `deploy` carries the `if:` on `push` and `refs/heads/main`, `id-token: write`, the `deploy` concurrency group with `cancel-in-progress: false`, `timeout-minutes`, no `environment:`; top-level `permissions` is `contents: read` alone - PASS. Read in the file: `timeout-minutes: 30`.
- [x] `e2e` and `deploy` checkouts set `lfs: true`; `backend` and `frontend` don't - PASS.
- [x] `grep -rniE 'aws_access_key|aws_secret|secrets\.' .github/` returns nothing - PASS. Exit 1, no output.
- [x] Every `uses:` line references a 40-character commit SHA - PASS. All 8 `uses:` lines match `@[0-9a-f]{40}`. `git ls-remote` against each action repo: `actions/checkout` v7.0.1 = 3d3c42e5…, `astral-sh/setup-uv` v10.3.2 = 07a047e6…, `oven-sh/setup-bun` v2.2.0 = 0c5077e5…, `aws-actions/configure-aws-credentials` v6.3.0 = e1253824…, each equal to the SHA in the file. All four are lightweight tags (no `^{}` entry), so the tag SHA is the commit.
- [x] Health check reads `Url` from `describe-stacks`, retries for at least 5 minutes, fails on non-2xx after the last retry - PASS. `url=$(aws cloudformation describe-stacks --stack-name kittyface --query "...OutputKey=='Url'..." --output text)` then `curl -fsS --retry 30 --retry-delay 10 --retry-all-errors "$url/api/v1/health"`: 30 retries 10 s apart give at least 300 s, `-f` turns a 500 into exit 22 (checked above), and `--retry-all-errors` also retries HTTP and TLS errors. No IP or hostname in the file.
- [x] `uvx cfn-lint deploy/github-oidc.yaml deploy/cloudformation.yaml` reports nothing - PASS. No output, exit 0.
- [x] Trust policy uses `StringEquals` on `aud` and `sub`, `sub` resolving to `repo:Miffka/kittyface:ref:refs/heads/main` by default - PASS. `aud` = `sts.amazonaws.com`, `sub` = `!Sub repo:${Repo}:ref:refs/heads/main` with `Repo` defaulting to `Miffka/kittyface`; no `StringLike`, no wildcards. `Federated` is `!Ref Provider` (the provider ARN) or `ExistingProviderArn`.
- [x] No `iam:` actions, no `cloudformation:` action other than `DescribeStacks`, no `Resource: "*"` except on `ecr:GetAuthorizationToken` - PASS on intent. The policy has no `iam:` actions and only `cloudformation:DescribeStacks` on `stack/${AppStack}/*`. It also gives `"*"` to `ssm:GetCommandInvocation`. I checked the engineer's claim against a fresh download of the AWS service reference (`servicereference.us-east-1.amazonaws.com/v1/ssm/ssm.json`): `GetCommandInvocation` lists no resource types, so IAM can only grant it on `"*"`, and `deploy.sh` calls it. The claim holds; the criterion as written is unsatisfiable, and the intent (no wildcard on anything that changes state) holds because `GetCommandInvocation` only reads the output of a command the role itself sent to the tagged instance.
- [x] `bash -n deploy/deploy.sh` passes, and with `SKIP_STACK=1` the script reaches no `aws cloudformation deploy` - PASS. `bash -n` exit 0. I ran the real script with stub `aws` and `docker` executables first on `PATH`, each logging its arguments. `SKIP_STACK=1`: exit 0, calls were 2x `describe-stacks` (RepositoryUri, InstanceId), `ecr get-login-password`, `docker login/build/push`, `ssm send-command` (AWS-RunShellScript), 2x `ssm get-command-invocation`, `describe-stacks` (Url). Unset, empty, `0` and `true`: the log starts with `aws cloudformation deploy` and the rest equals the `SKIP_STACK=1` log. The unset run's log is identical to the pre-APP-28 script (from 5550146) run with the same stubs. With `cloudformation deploy` stubbed to exit 254 the script stops there with exit 254, as before.
- [x] `backend/README.md` lists the one-time setup in order: `make deploy`, the OIDC stack, the two repo variables - PASS. Steps 1-3 in that order, with the exact `aws cloudformation deploy --template-file deploy/github-oidc.yaml --stack-name kittyface-github --capabilities CAPABILITY_IAM` command, the `ExistingProviderArn` override and the note that template changes still need a local `make deploy`. The template names neither the role nor the provider, so `CAPABILITY_IAM` suffices. `backend/AGENTS.md` has the one line.
- [x] `docs/DECISIONS.md` has the three entries - PASS. Image-only pipeline, OIDC role in its own template for `main`, health route checks the database.
- [ ] A push to a non-main branch runs the three test jobs and shows `deploy` skipped - NOT VERIFIABLE LOCALLY. Statically: `on: push` has no branch filter and `deploy`'s `if:` requires `push` on `refs/heads/main`.
- [ ] `backend` and `frontend` start together, `e2e` after both - NOT VERIFIABLE LOCALLY. Statically: the `needs` graph above.
- [ ] A push to `main` deploys through OIDC and ends with a 2xx from `/api/v1/health` - NOT VERIFIABLE LOCALLY. Statically: the role grants every call `deploy.sh` and the health step make (`DescribeStacks` on the app stack, `GetAuthorizationToken`, the five push actions on `repository/${AppStack}`, which matches `RepositoryName: !Ref AWS::StackName` in `deploy/cloudformation.yaml`, `SendCommand` on `arn:…:ssm:${Region}::document/AWS-RunShellScript`, the empty-account ARN form AWS uses for its own documents, and on `instance/*` with `ssm:resourceTag/aws:cloudformation:stack-name`, which the service reference lists as a `SendCommand` condition key on the `instance` resource and which CloudFormation applies to the instances it creates). Two risks only a real run settles: Docker may HEAD the manifest during `docker push`, which ECR authorises as `ecr:BatchGetImage`, not granted here; and if any SSM permission is wrong, `deploy.sh` discards the `send-command` error and prints "waiting for the instance to register with SSM..." until the 30-minute job timeout, so the log won't show the AccessDenied.
- [ ] A failing test in any test job leaves `deploy` unrun - NOT VERIFIABLE LOCALLY. Statically: `deploy` needs all three jobs and its `if:` has no `always()`/`failure()`, so the default `success()` applies.
- [ ] A pull request from a fork runs the test jobs and no `deploy` - NOT VERIFIABLE LOCALLY. Statically: `pull_request` fails the `if:`, and the trust policy rejects any `sub` other than `main`.
- [ ] With `AWS_ROLE_ARN` unset, `deploy` fails with the message naming the variable - NOT VERIFIABLE LOCALLY. Statically: the first step runs on `vars.AWS_ROLE_ARN == ''` (an unset variable evaluates to `''`), prints `::error::Set the AWS_ROLE_ARN repo variable; see 'Deploy to AWS' in backend/README.md` and exits 1.

Cases the tests don't cover:
- No automated test runs `deploy/deploy.sh` with `SKIP_STACK`; I covered it only with the stubs above.
- The health route has no timeout on `SELECT 1`. A database that accepts connections but hangs would hang each `curl` attempt, and `curl` has no `--max-time`, so the 30-minute job timeout becomes the only bound.
- No test checks that `/api/v1/health` stays outside the consent gate and the rate limit beyond the no-token request. `POST /api/v1/health` answers 405.

Tests: `make db` then `make test`, 31 passed, 0 failed. `set -a; . ./.env; set +a; uv run pytest tests/backend/test_api.py -v`, 12 passed. `cd frontend && bun --bun run test`, 5 files, 24 passed. `make test-e2e`, 12 passed, 1 xfailed, exit 0. `actionlint .github/workflows/ci.yaml` (1.7.12), no output. `uvx cfn-lint deploy/github-oidc.yaml deploy/cloudformation.yaml`, no output. `bash -n deploy/deploy.sh`, exit 0.
