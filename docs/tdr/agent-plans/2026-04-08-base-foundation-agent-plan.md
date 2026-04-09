# Base Foundation Agent Plan

## Goal
- Implement the approved base foundation in an isolated worktree without adding business features.

## Steps
- Bootstrap repository tooling and dependency management.
- Establish the TDR, EARS spec, implementation plan, and templates.
- Build the NestJS base with validated env config, Prisma bootstrap, and health checks.
- Add unit, integration, and mutation test harnesses.
- Verify with lint, typecheck, coverage, integration tests, and Stryker.

## Constraints
- Do not introduce `src/modules/`.
- Keep the code REST-only.
- Use TDD for application code.
- Maintain 100% unit-test coverage.
