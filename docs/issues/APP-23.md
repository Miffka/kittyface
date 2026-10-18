# APP-23: go live

Groomed from the [APP-23 entry](../backlog.md#app-23-go-live). Status: implemented, not yet deployed. The main session planned it with the product owner and built it without the PM, Engineer and QA subagents.

**Story.** As an operator, I want the app running on the specified AWS instance with its migrations applying automatically, so it's reachable by users.

**Scope.**
- `deploy/cloudformation.yaml`: an ECR repo (keeps 3 images), an instance role with SSM and ECR read access, a security group open on 80 and 443 only, an Elastic IP, and a t3.micro running Ubuntu 24.04 with a 20 GB gp3 disk in the default VPC. First-boot UserData creates a 2 GB swap file, installs Docker, compose and the ECR credential helper, and writes `/opt/kittyface/{.env,compose.yaml,Caddyfile}` with a Postgres password generated on the instance.
- The instance's compose runs the ECR image, `postgres:17` and Caddy. Caddy serves `https://<elastic-ip>.sslip.io` with a Let's Encrypt certificate and proxies to the app. No service publishes the database port.
- `deploy/deploy.sh` and `make deploy`: deploy the stack, build and push the image, then pull it and restart compose over SSM, waiting for first-boot setup to finish.
- Migrations need no new code: `backend/main.py` runs `alembic upgrade head` at import, before uvicorn serves.
- Docs: `backend/README.md` "Deploy to AWS", a `docs/DECISIONS.md` entry and a `docs/AI_WORKFLOW.md` entry.

**Acceptance criteria.**
- [ ] A fresh t3.micro instance ends provisioning with a 2 GB swap file active (`swapon --show`).
- [ ] Starting against a fresh database on that instance applies migrations before `https://<ip>.sslip.io/api/v1/config` responds.
- [ ] The running app serves APP-1 through APP-16's flows end to end.
- [ ] A second `make deploy` leaves the stack unchanged, replaces the image and keeps saved uploads.

**Out of scope.** Database backups, a real domain and alerts (APP-24).
