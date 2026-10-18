# APP-26: demo seed data

Groomed retrospectively. New ID, not in the original backlog. Status: delivered.

**Story.** As a developer, I want a known token with saved uploads, so I can see the History pages populated without creating data first.

**Scope.**
- `backend/store.py` `DEMO_TOKEN` is 32 zeros. `seed` writes a consent record for it and three uploads (`seed-1` to `seed-3`) with a generated PNG, 48 placed landmarks and scores of all 0, all 1 and all 2. The stored ratios produce those scores under `models/thresholds.json` (`fgs-manual-1.0.0`), so a refit can leave them inconsistent. Creation dates are 3, 2 and 1 days ago.
- `seed` runs on every start through `session.merge`, so repeated starts do not duplicate rows.
- To use it, paste the token into the frontend's localStorage key `cfs.client_token`.

**Acceptance criteria.**
- [x] The demo token lists `seed-3`, `seed-2`, `seed-1` in that order (`test_demo_token_sees_seed_newest_first`).
- [x] `seed-1` serves a PNG image.
- [x] Starting the app twice leaves one copy of each seed row.

**Depends on.** [APP-11](APP-11.md), [APP-13](APP-13.md).

**Out of scope.**
- A deleted seed upload returns on the next start. Acceptable for development.
- The seed runs in every environment, so a production database gets the demo token and its pre-granted consent. Add an environment switch before [APP-23](../backlog.md#app-23-go-live). No backlog entry covers it yet.
