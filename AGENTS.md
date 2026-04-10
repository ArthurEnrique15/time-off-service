# Agent Instructions

These instructions are mandatory for every agent working in this repository.

## Worktree Rule
- **Never make code or documentation changes directly in the main workspace.**
- Every feature branch must be developed inside a dedicated git worktree under `.worktrees/<branch-name>/`.
- Create the worktree before writing any files: `git worktree add .worktrees/<branch-name> -b <branch-name>`.
- All file reads, edits, and test runs must target the worktree path, not the main workspace path.

## Delivery Flow
- Always use Superpowers skills before taking action.
- Always use spec-driven development combined with TDD.
- Always write or update the feature spec before writing implementation code.
- All feature specs must use EARS notation for implementable requirements.
- Every feature plan must be linked from the master TDR.
- Every agent work plan must be saved in the repository.

## Workspace Rules
- **Never commit anything directly to the main workspace.** All development work — including specs, plans, and implementation — must happen inside a git worktree.
- The first action when starting any feature is to create a worktree using the `using-git-worktrees` skill.
- Use `.worktrees/<branch-name>` as the worktree path (`.worktrees/` is gitignored).
- Spec and plan files written before a worktree exists must be staged and committed inside the worktree, not in the main workspace.

## Ambiguity Policy
- Never infer on ambiguous product or technical requirements.
- Stop and ask the user for clarification whenever a decision could change behavior, public contracts, persistence, testing scope, or workflow.
- If a safe default is used for a low-risk detail, document it in the TDR or plan immediately.

## Testing Rules
- Use TDD for every behavior change: write the failing test, verify it fails for the right reason, write the minimum implementation, then rerun.
- Run the relevant automated tests after every feature implementation.
- Maintain 100% unit-test coverage.
- Keep unit tests small and focused. Prefer one observable behavior per test.
- Follow the style used in the GCB Nest services: assert responses, class interactions, and dependency calls with minimal setup.
- Keep integration tests in-process with Nest + Supertest unless the user approves a different strategy.
- Add or update mutation testing targets when a feature stabilizes.
- Run mutation testing with `npm run stryker` (scoped to files changed vs `origin/main`). Use `npm run stryker:all` only when verifying the full baseline. Never use `--incremental`; git worktrees start with a cold cache so it provides no benefit.

## Documentation Rules
- Keep the master TDR current.
- Save feature specs under `docs/tdr/specs/`. **Do not create any other specs directories.**
- Save feature implementation plans under `docs/tdr/feature-plans/`.
- Save agent work plans under `docs/tdr/agent-plans/`.
- Link new specs and plans from `docs/tdr/master.md`.
- Never create documentation outside the `docs/tdr/` tree unless explicitly instructed.

## Code Structure
- This is a small service. Do not introduce `src/modules/`.
- Prefer the root layers `src/core`, `src/http`, `src/module`, `src/prisma`, and `src/shared`.
- Keep files focused and small.
- Preserve REST-only contracts. Do not add GraphQL.
