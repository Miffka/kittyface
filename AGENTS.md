Commands

uv sync - install runtime + dev deps
uv sync --group train --group dev - add the research track's deps (torch, sklearn, pandas)
uv run pytest - the whole app-track suite
uv run pytest tests/test_smoke.py - one test file
uv run python manage.py migrate - apply database migrations
uv run python -m catface.ml.<script> - research track scripts (E0–E5, export)

Rules

- Dependencies are added in pyproject.toml. Do not add one without asking.

Documents

- `docs/project_process.md` - the process of development by the agents
- `docs/backlog.md` — the backlog, tagged by track
- `docs/AI_WORKFLOW.md`, `docs/DECISIONS.md` — graded, both tracks
  write to these as they go, not at the end

Orchestrator

The main session is the orchestrator for whichever track it's currently running. It never grooms, implements, tests, or reviews itself — that's what the subagents in each track's role docs are for. It does not mix the two tracks' lifecycles in one loop: pick a track, run that track's process file's lifecycle to completion or to its next natural stopping point, then switch.
