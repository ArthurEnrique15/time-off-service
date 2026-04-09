# Time-Off Service Technical Decision Record

## Objective
- Build a NestJS + SQLite time-off microservice for the take-home exercise.
- Keep the repository optimized for agentic delivery, specification quality, and strong automated tests.

## Core Decisions
- Runtime: NestJS
- Persistence: Prisma with SQLite
- API style: REST only
- Development method: Spec-driven development plus TDD
- Requirements notation: EARS for every implementable feature requirement
- Base source structure: `src/core`, `src/http`, `src/module`, `src/prisma`, `src/shared`
- Integration testing: in-process Nest application with Supertest and mock HCM endpoints
- Mutation testing: Stryker, expanded incrementally feature-by-feature

## Governance
- Agents must follow [`AGENTS.md`](/Users/arthur/www/projects/time-off-service/.worktrees/base-foundation/AGENTS.md).
- Ambiguous requirements must be clarified with the user before implementation.
- The TDR is the source of truth for architectural decisions and links to executable specs and plans.

## Active Documents
- Base foundation spec: [2026-04-08-base-foundation-spec.md](/Users/arthur/www/projects/time-off-service/.worktrees/base-foundation/docs/tdr/specs/2026-04-08-base-foundation-spec.md)
- Base foundation implementation plan: [2026-04-08-base-foundation-plan.md](/Users/arthur/www/projects/time-off-service/.worktrees/base-foundation/docs/tdr/feature-plans/2026-04-08-base-foundation-plan.md)
- Base foundation agent plan: [2026-04-08-base-foundation-agent-plan.md](/Users/arthur/www/projects/time-off-service/.worktrees/base-foundation/docs/tdr/agent-plans/2026-04-08-base-foundation-agent-plan.md)

## Pending Product Definitions
- Canonical terminology for balances, requests, adjustments, and sync events
- Time model and date boundary policy
- HCM sync semantics and idempotency rules
- Error contract and versioning policy
