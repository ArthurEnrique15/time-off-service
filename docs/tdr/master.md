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
- **Feature roadmap:** [feature-roadmap.md](./feature-roadmap.md)
- Base foundation spec: [2026-04-08-base-foundation-spec.md](./specs/2026-04-08-base-foundation-spec.md)
- Base foundation implementation plan: [2026-04-08-base-foundation-plan.md](./feature-plans/2026-04-08-base-foundation-plan.md)
- Base foundation agent plan: [2026-04-08-base-foundation-agent-plan.md](./agent-plans/2026-04-08-base-foundation-agent-plan.md)
- F1 domain models spec: [f1-domain-models-spec.md](./specs/f1-domain-models-spec.md)
- F1 domain models plan: [f1-domain-models-plan.md](./feature-plans/f1-domain-models-plan.md)
- F3 balance audit trail spec: [f3-balance-audit-trail-spec.md](./specs/f3-balance-audit-trail-spec.md)
- F3 balance audit trail plan: [f3-balance-audit-trail-plan.md](./feature-plans/f3-balance-audit-trail-plan.md)

## Pending Product Definitions
- Canonical terminology for balances, requests, adjustments, and sync events
- Time model and date boundary policy
- HCM sync semantics and idempotency rules
- Error contract and versioning policy

## F1 Design Decisions

Resolved during F1 brainstorming. These are authoritative for all downstream features.

| Decision | Choice | Rationale |
|---|---|---|
| Balance fields | `availableDays` + `reservedDays` | Standard model supports F5 tentative reservation without workarounds |
| Time dimension on requests | `startDate` + `endDate` date range | Aligns with typical PTO workflows; day count derived as (end − start + 1) |
| Day granularity | Integer days only | Matches take-home scope; no half-day support needed |
| Request status model | PENDING, APPROVED, REJECTED, CANCELLED | Simple four-state; HCM sync outcomes handled via rollback, not extra states |
| Balance uniqueness | Composite unique on (employeeId, locationId) | One balance per dimension enforced at the DB level |
| Employee / location IDs | Opaque strings from HCM | No local entity tables; "referenced by ID only" per roadmap |
| Primary key strategy | UUID (`@default(uuid())`) | Consistent across all domain models |
| Enum strategy | String fields with documented constants | SQLite provider does not support Prisma `enum`; values enforced at application layer |
| Audit → related entity | Nullable FK to TimeOffRequest + free-text `reference` | Direct typed link for request changes; flexible for sync/manual |
| Migration approach | Single atomic migration for all models | Greenfield; maximizes Phase 2 parallelism |

## F3 Design Decisions

Resolved during F3 brainstorming. These are authoritative for the audit trail feature and downstream consumers.

| Decision | Choice | Rationale |
|---|---|---|
| Audit write surface | Internal service method only | No external POST; downstream features inject the service |
| History pagination | Offset/limit (`page`, `limit`) | Simple, matches typical REST APIs |
| History default sort | Descending by `createdAt` | Most-recent-first is the natural audit view |
| History reason filter | Optional `?reason=` query param | Allows callers to narrow by change type |
| Balance not found | HTTP 404 | Clear signal vs. ambiguous empty array |
| Reason constant location | Exported from the service file | Single source of truth; extract later if needed |
| Paginated response shape | `{ data, pagination: { page, limit, total, totalPages } }` | Standard offset/limit envelope |
