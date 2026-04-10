# F10 Cancellation Agent Plan

## Goal
- Implement Feature 10 in the dedicated worktree with docs-first delivery, TDD,
  and full verification.

## Steps
- Save the F10 spec, implementation plan, and master TDR design decisions.
- Add failing unit tests for balance restoration and request cancellation logic.
- Implement the minimum production changes to satisfy the service and controller tests.
- Add failing integration tests for the cancel endpoint and complete the behavior.
- Run the required verification commands, including Stryker.

## Constraints
- Work only inside `.worktrees/f10-time-off-request-cancellation/`.
- Use TDD for every behavior change.
- Keep documentation under `docs/tdr/` and keep `docs/tdr/master.md` current.
- Preserve REST-only contracts and the existing source structure.
