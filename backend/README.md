# Backend

```sh
cp .example.env .env   # then set a real POSTGRES_PASSWORD
make db                # Postgres from docker-compose.yaml, on localhost:5433
make backend           # uvicorn on port 8091
```

`.env` holds `export` lines, so `make`, `docker compose` and `source .env` all read it. `make` targets get `DATABASE_URL` from it; outside `make`, run `source .env` first.

The frontend's `frontend/.env.development` points `VITE_API_BASE_URL` at this port. Set `VITE_USE_MOCK_API=true` to run the frontend without a backend.
The backend stores data in Postgres through SQLAlchemy and the `psycopg` driver. `DATABASE_URL` names the database as `postgresql+psycopg://user:pass@host:port/db`, and the backend refuses to start without it.

## Migrations

On start, the backend runs the Alembic migrations in `backend/migrations/` up to head, then writes the demo seed. `uv run alembic upgrade head` from the repo root does the same without starting the server. Both read the database from `DATABASE_URL`.

## Tests

`make test` needs the compose Postgres from `make db`. `tests/backend/conftest.py` creates a throwaway `kittyface_test_<hex>` database on the server `DATABASE_URL` names and drops it when the session ends. Set `TEST_POSTGRES_URL` to use another Postgres server; the tests need a role allowed to create databases.

## Serving the frontend

After `bun --bun run build` in `frontend/`, the backend serves `frontend/.output/public` at `/`, so http://localhost:8091 opens the app. Set `FRONTEND_DIR` to serve a build from another directory. Any path without a matching file gets `_shell.html`, which lets the client router handle `/history/<id>` and other routes on reload. Unknown paths under `/api/` still return 404. Without a build, the backend serves only the API.

## Docker

```sh
make docker-build   # docker build -t kittyface .
make docker-up      # docker compose up --build: the app plus Postgres
make docker-down    # docker compose down
```

The `Dockerfile` builds the frontend in a Node stage, then copies the backend, `models/thresholds.json` and the frontend build into a Python image. The image holds no database: pass `DATABASE_URL`, and it runs the migrations on start.

`docker-compose.yaml` runs the image against a `postgres:17` service and waits for its health check before starting the app, so the app migrates a ready database. Postgres keeps its data in the `kittyface-pg` volume; `docker compose down -v` deletes it. The `db` service publishes port 5433 on the host, so `make backend` and the tests can reach it without colliding with another Postgres on 5432. The user, password and database name come from `.env`, and compose refuses to start when one is missing. Postgres applies `POSTGRES_PASSWORD` only when it creates the volume. To change the password later, run `ALTER USER` in the database or delete the volume.

## Deploy to AWS

```sh
aws configure   # once: keys and region for the target account
make deploy     # STACK=name picks another stack, default kittyface
```

`deploy/deploy.sh` creates or updates the CloudFormation stack in `deploy/cloudformation.yaml`, builds the image for `linux/amd64`, pushes it to the stack's ECR repo, then pulls it and restarts compose on the instance over SSM. It prints the app's URL, `https://<elastic-ip>.sslip.io`. The first run takes a few minutes longer while the instance installs Docker.

The instance is a t3.micro running Ubuntu 24.04 with a 2 GB swap file, and runs the app, `postgres:17` and Caddy from `/opt/kittyface/compose.yaml`. Postgres keeps its data on the instance's disk, so deleting the stack or replacing the instance deletes every upload. Open a shell with `aws ssm start-session --target <instance-id>`, which needs the [Session Manager plugin](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html). `aws cloudformation delete-stack --stack-name kittyface` removes everything.

### Deploy from GitHub Actions

`.github/workflows/ci.yaml` runs the backend and frontend tests in parallel on every push and pull request, then the E2E suite. A passing push to `main` runs `deploy/deploy.sh` with `SKIP_STACK=1`, which pushes the image and restarts compose but leaves the stack alone, then waits up to 5 minutes for a 200 from `<Url>/api/v1/health`. The job assumes an IAM role through GitHub OIDC, so the repo holds no AWS keys.

One-time setup, in this order:

1. Run `make deploy` once with your own credentials, so the `kittyface` stack exists.
2. Create the deploy role and the GitHub OIDC provider with admin credentials:
   ```sh
   aws cloudformation deploy --template-file deploy/github-oidc.yaml --stack-name kittyface-github --capabilities CAPABILITY_IAM
   aws cloudformation describe-stacks --stack-name kittyface-github --query "Stacks[0].Outputs[?OutputKey=='RoleArn'].OutputValue" --output text
   ```
   If the account already has a provider for `token.actions.githubusercontent.com`, add `--parameter-overrides ExistingProviderArn=<its arn>`. The role trusts pushes to `main` of `Miffka/kittyface` only.
3. In the GitHub repo, under Settings > Secrets and variables > Actions > Secrets, add the repository secrets `AWS_ROLE_ARN`, set to the printed ARN, and `AWS_REGION`, set to the stack's region. They're secrets so the account ID stays out of the public run logs.

The role can't change the stack, so edits to `deploy/cloudformation.yaml` still need a local `make deploy`. Don't run one while a pipeline deploy is in progress: the pipeline only queues its own deploys.
