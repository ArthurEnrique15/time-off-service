# F9 Agent Plan

## Goal
- Implement F9 by making request creation local-only and moving HCM submission to manager approval, with explicit business-rejection and operational-failure branches.

## Steps
- Save the F9 spec, feature plan, and TDR updates before changing code.
- Add failing unit tests for `HCM_SYNC`, local-only create, and approval sync branches.
- Implement the minimal service and audit changes to satisfy the new unit tests.
- Add failing integration tests for create/approve behavior and update the mock HCM support as needed.
- Run unit, integration, lint, typecheck, and mutation verification before finishing.

## Constraints
- Work only inside `.worktrees/f9-hcm-sync-on-approval`.
- Follow spec-driven development and TDD.
- Keep REST-only contracts and existing root layer structure.
- Do not add new request statuses.
