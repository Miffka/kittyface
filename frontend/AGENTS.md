## Commands

Run from `frontend/`.

- `bun install` installs dependencies.
- `bun --bun run dev` starts the dev server on http://localhost:8080.
- `bun --bun run build` builds the app.
- `bun --bun run test` runs the tests.
- Set `VITE_USE_MOCK_API=true` to run without a backend.

## Rules

- Never hand-edit `src/routeTree.gen.ts`.
- Routing follows `src/routes/README.md`.

## Architecture

- Every backend call goes through `src/api/client.ts`, which picks the HTTP or in-memory mock service — keeps the app runnable without a backend.
- `src/ml/` and `src/geometry/` keep fixed signatures; UI never resizes images or computes ratios. `src/geometry/measurements.ts` is a hand port of `kittyface.core.geometry`'s AU metrics; change both together, and the parity test in `src/test/geometry-detection.test.ts` pins the Python values.
- `src/ml/`, `src/geometry/`, `src/api/` contain no UI code and no `any` — they're swapped/maintained independently.
- localStorage holds only the client token and accepted notice version — privacy requirement from the spec.

## Documents

- [frontend/README.md](README.md) holds the spec and setup notes.
- [src/routes/README.md](src/routes/README.md) holds the routing conventions.
