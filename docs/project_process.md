Delivers the backend, storage, frontend, deploy, observability.

- PM — grooms a task before implementation, follows `docs/team/pm.md`
- Engineer — implements one groomed task, follows
  `docs/team/software-engineer.md`
- QA — checks the result against acceptance criteria, follows
  `docs/team/qa-engineer.md`

Orchestrator

The main session is the orchestrator. It launches PM, Engineer, and QA
as subagents. It does not groom, implement, or test itself.

Lifecycle

1. Pick the next open issue, milestone order first
2. PM grooms it
3. Engineer implements it
4. QA verifies it
5. On FAIL, back to step 3 with the QA comment as input
6. On PASS, close the issue
7. Repeat until the milestone's issues are empty, then move to the next milestone

Rules

- Do not skip step 2
- The engineer does not close the issue
- QA does not fix the code, only outputs PASS or FAIL
- The orchestrator closes the issue only after QA outputs PASS
