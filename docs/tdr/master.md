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
- F2 balance management spec: [f2-balance-management-spec.md](./specs/f2-balance-management-spec.md)
- F2 balance management plan: [f2-balance-management-plan.md](./feature-plans/f2-balance-management-plan.md)
- F3 balance audit trail spec: [f3-balance-audit-trail-spec.md](./specs/f3-balance-audit-trail-spec.md)
- F3 balance audit trail plan: [f3-balance-audit-trail-plan.md](./feature-plans/f3-balance-audit-trail-plan.md)
- F4 HCM client spec: [f4-hcm-client-spec.md](./specs/f4-hcm-client-spec.md)
- F4 HCM client plan: [f4-hcm-client-plan.md](./feature-plans/f4-hcm-client-plan.md)
- F5 time-off request create spec: [f5-time-off-request-create-spec.md](./specs/f5-time-off-request-create-spec.md)
- F5 time-off request create plan: [f5-time-off-request-create-plan.md](./feature-plans/f5-time-off-request-create-plan.md)
- F6 time-off request read/list spec: [f6-time-off-request-read-list-spec.md](./specs/f6-time-off-request-read-list-spec.md)
- F6 time-off request read/list plan: [f6-time-off-request-read-list-plan.md](./feature-plans/f6-time-off-request-read-list-plan.md)
- F7 HCM batch sync spec: [f7-hcm-batch-sync-spec.md](./specs/f7-hcm-batch-sync-spec.md)
- F7 HCM batch sync plan: [f7-hcm-batch-sync-plan.md](./feature-plans/f7-hcm-batch-sync-plan.md)

## F7 Design Decisions

Resolved during F7 brainstorming. These are authoritative for the HCM batch sync feature and downstream consumers.

| Decision | Choice | Rationale |
|---|---|---|
| New balance (unknown pair) | Upsert — create locally | Batch is authoritative; unknown pairs are valid new data |
| Conflict handling (PENDING request + balance change) | Flag in response, still apply update | Balance stays accurate; caller can act on conflict list |
| Partial failure | Continue processing all entries, collect errors | No partial-batch aborts; response reports every outcome |
| Response body | Summary + conflict list + error list | Actionable response; callers can correlate outcomes |
| Balance unchanged | Skip (no update, no audit, no conflict check) | No-op avoids noise in audit trail |
| Per-entry transactions | Each entry in its own `$transaction` | Isolates failures; aligns with partial-success policy |
| Audit delta for new balances | `availableDays` (as if prior was 0) | Consistent representation; full value created from nothing |
| Mock HCM extension | Add `GET /balances` returning all seeded balances | Enables realistic end-to-end integration test flow |
| `upsertBalance` location | Added to `BalanceService` | Keeps all balance mutations in one place |
| HTTP status on partial success | 200 | Batch ran to completion; body describes individual outcomes |
| Input validation | class-validator DTOs + global `ValidationPipe` | F7 is first feature with nested array validation; DTOs are the right tool |

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

## F2 Design Decisions

Resolved during F2 planning. These are authoritative for all features consuming balance operations.

| Decision | Choice | Rationale |
|---|---|---|
| Internal method scope | All 5 mutation methods in F2 | Defines the balance contract for all downstream features |
| Insufficient balance handling | Service throws error | Defensive — prevents invalid state at domain layer |
| Balance not found (GET) | 404 response | Standard REST; balances must exist from HCM sync |
| Balance not found (internal) | Service throws NotFoundException | Callers handle not-found; no silent failures |
| List pagination | None for now | Employee rarely has many locations; add later if needed |
| List empty result | 200 with empty array | Standard REST — empty collection is not an error |
| employeeId query param | Required (400 if missing) | Listing all balances globally is not a valid use case |
| Error class for insufficient balance | InsufficientBalanceError extends BadRequestException | Domain-specific, maps to 400 HTTP status automatically |

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

## F4 Design Decisions

Resolved during F4 brainstorming. These are authoritative for all downstream features
that interact with the HCM or use shared infrastructure.

| Decision | Choice | Rationale |
|---|---|---|
| Error handling pattern | `Either<Failure, Success>` (GCB pattern) | Newer GCB repos (billing, invoice) use this consistently; explicit, composable, no try/catch needed by callers |
| HTTP layer | `CustomHttpService` wrapping `@nestjs/axios` | Matches GCB pattern; never throws; normalizes network errors to `AxiosResponse` |
| `checkConnection` refactor | Uses `CustomHttpService` internally, keeps `boolean` return | Consistency within the client; health check callers unaffected |
| HCM API contract | Self-defined REST contract (we control the mock) | GET balance, POST time-off, DELETE time-off |
| HCM error codes | `INVALID_DIMENSIONS`, `INSUFFICIENT_BALANCE`, `NOT_FOUND`, `UNKNOWN` | Covers all HCM rejection cases from the take-home spec |
| Either type location | `src/shared/core/either/` | Follows GCB directory structure; reusable by all downstream features |
| CustomHttpService location | `src/shared/core/custom-http/` | Follows GCB directory structure; separate from HCM-specific code |
| HCM types location | `src/shared/providers/hcm/hcm.types.ts` | Co-located with client; DTOs are HCM-specific |
| Mock HCM server | Stateful with seedable balances/requests | Allows integration tests to configure realistic scenarios |
| Date handling library | `date-fns` | See detailed rationale below |

### Date Handling: date-fns

**Context:** The service and its test infrastructure need to calculate the number of calendar days spanned by a `startDate`/`endDate` pair (ISO-8601 strings). This appears in the mock HCM server's `daysRequested` computation and may recur in future features (e.g., F5 reservation logic).

**Alternatives considered:**

| Alternative | Assessment |
|---|---|
| Native JS `Date` arithmetic (`getTime()` subtraction) | Works for simple day-diff, but error-prone: DST transitions can shift `getTime()` differences by ±1 hour, producing off-by-one day counts; requires manual millisecond-to-day conversion (`/ 86_400_000`); no parsing utilities; no readable intent |
| `Temporal` (TC39 proposal) | Correct and DST-safe, but requires a polyfill (not yet Node-native); adds an experimental dependency; not production-ready for this scope |
| `luxon` / `moment` | Full-featured, but `moment` is in maintenance mode; `luxon` has no tree-shaking; both are heavier than needed |
| `date-fns` | Pure functions, fully tree-shakeable, TypeScript-first, handles DST correctly via calendar-day semantics, actively maintained, zero-dependency; `differenceInCalendarDays` + `parseISO` cover all current needs |

**Decision:** Use `date-fns`.

**Rationale:**
- `differenceInCalendarDays` operates on calendar dates (not epoch ms), making it immune to DST-induced off-by-one errors.
- `parseISO` ensures consistent parsing of ISO-8601 strings regardless of runtime locale.
- Tree-shakeable: only imported functions are bundled, keeping the production build lean.
- Consistent with modern NestJS/TypeScript ecosystem conventions.

## F5 Design Decisions

Resolved during F5 brainstorming. These are authoritative for all downstream features
that create or cancel time-off requests.

| Decision | Choice | Rationale |
|---|---|---|
| Orchestration location | `TimeOffRequestService` | Thin controller pattern; injectable, unit-testable |
| Local balance check order | Before HCM call | Fail fast without external I/O when balance is obviously insufficient |
| HCM submit timing | After local check, before DB write | HCM is the authoritative source; no local write until HCM confirms |
| DB write atomicity | Prisma transaction: `reserve()` + `timeOffRequest.create()` | Prevents balance reserved without request record (or vice versa) |
| Audit log timing | After transaction commits | `requestId` is needed for the audit entry; only available after create |
| `hcmRequestId` storage | New nullable `String?` on `TimeOffRequest` | Required by F10 (cancellation via `cancelTimeOff(hcmRequestId)`) |
| `daysRequested` computation | `differenceInCalendarDays(parseISO(endDate), parseISO(startDate)) + 1` via `date-fns` | Immune to DST off-by-ones; consistent with F4 mock server logic |
| Date parsing | `date-fns/parseISO` throughout | Consistent locale-independent ISO-8601 parsing; no `new Date()` raw construction |
| `startDate > endDate` check | `isAfter(parseISO(startDate), parseISO(endDate))` via `date-fns` | Avoids raw `Date` comparison pitfalls |
| Input validation | `class-validator` DTOs + global `ValidationPipe` | Standard NestJS approach; no manual validation boilerplate |
| HCM error → HTTP status | `INVALID_DIMENSIONS` → 422, `INSUFFICIENT_BALANCE` → 400, `UNKNOWN` → 503 | 422 signals the input combination is invalid at the domain level; 503 signals downstream unavailability |

## F6 Design Decisions

Resolved during F6 brainstorming. These are authoritative for all downstream features
that read time-off requests.

| Decision | Choice | Rationale |
|---|---|---|
| Pagination | Offset/limit (`page`, `limit`) | Employees accumulate many requests; consistent with F3 |
| Extra filters | None beyond `employeeId` + optional `status` | YAGNI |
| Default sort | Descending by `createdAt` | Consistent with F3; most useful default |
| Invalid status value | HTTP 400 | Consistent with F3 invalid-reason behavior |
| Missing `employeeId` on list | HTTP 400 | Consistent with F2 balance list |
| Single request not found | HTTP 404 | Standard REST |
| Inline validation | In controller, no class-validator DTOs | Matches every existing controller |
| `page`/`limit` out of range | Default / cap (1..100) | Matches F3 behavior |
| Paginated response shape | `{ data, pagination: { page, limit, total, totalPages } }` | Consistent with F3 envelope |
