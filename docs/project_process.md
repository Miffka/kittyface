# Project process

This process delivers the backend, storage, frontend, deploy and observability.

## Documents

- [backend/AGENTS.md](../backend/AGENTS.md) and [backend/README.md](../backend/README.md) cover the backend
- [frontend/AGENTS.md](../frontend/AGENTS.md) and [frontend/README.md](../frontend/README.md) cover the frontend
- [backlog.md](backlog.md) is the backlog, tagged by track
- [AI_WORKFLOW.md](AI_WORKFLOW.md) and [DECISIONS.md](DECISIONS.md) are graded and cover both tracks. Write to them as the work happens, not at the end.

## Roles

- PM grooms a task before implementation, follows [team/pm.md](team/pm.md)
- Engineer implements one groomed task, follows [team/software-engineer.md](team/software-engineer.md)
- QA checks the result against acceptance criteria, follows [team/qa-engineer.md](team/qa-engineer.md)

## Orchestrator

The main session is the orchestrator for whichever track it runs. It launches PM, Engineer and QA as subagents. It does not groom, implement, test or review itself.

The orchestrator does not mix the two tracks' lifecycles in one loop. Pick a track, run its lifecycle to completion or to its next natural stopping point, then switch.

## Lifecycle

1. Pick the next open issue, milestone order first
2. PM grooms it
3. Engineer implements it
4. QA verifies it
5. On FAIL, back to step 3 with the QA comment as input
6. On PASS, close the issue
7. Repeat until the milestone's issues are empty, then move to the next milestone

## Rules

- Do not skip step 2
- The engineer does not close the issue
- QA does not fix the code, only outputs PASS or FAIL
- The orchestrator closes the issue only after QA outputs PASS
