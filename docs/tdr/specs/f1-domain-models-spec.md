# F1 — Domain Models & Prisma Schema Specification

## Context

The time-off service needs foundational persistence models before any business feature
can be implemented. This specification defines the Prisma schema for three domain
models — Balance, TimeOffRequest, and BalanceAuditEntry — along with their enums,
relations, indexes, and a single atomic migration. No services, controllers, or
business logic are introduced; this feature is purely a data-layer concern.

Employees and locations are external entities managed by the HCM system and referenced
by opaque string IDs only.

## Design Decisions

These decisions were made during brainstorming and are authoritative for all
downstream features.

| Decision | Choice | Rationale |
|---|---|---|
| Balance fields | `availableDays` + `reservedDays` (standard) | Supports F5 tentative reservation without workarounds |
| Time dimension on requests | `startDate` + `endDate` date range | Aligns with typical PTO workflows; day count derived |
| Day granularity | Integer days only | Matches take-home scope; no half-day support needed |
| Request status model | PENDING → APPROVED → CANCELLED, plus PENDING → REJECTED | Simple four-state; HCM sync outcomes handled via rollback, not extra states |
| Balance uniqueness | Composite unique on (employeeId, locationId) | Enforces one-balance-per-dimension at the DB level |
| Employee/location IDs | Opaque strings from HCM | No local entity tables; "referenced by ID only" per roadmap |
| Primary key strategy | UUID (`@default(uuid())`) | Consistent across all domain models |
| Enum strategy | String fields with documented constants | SQLite provider does not support Prisma `enum`; values enforced at application layer |
| Audit → related entity | Nullable FK to TimeOffRequest + free-text `reference` | Direct typed link for request-driven changes; flexible for sync/manual |
| Migration approach | Single atomic migration for all models | Greenfield schema; maximizes Phase 2 parallelism |

## EARS Requirements

### Schema — Enum-like Constants

> **SQLite limitation:** The SQLite Prisma connector does not support native `enum`
> types. Status and reason fields are stored as `String` with documented constant
> values. Application-layer validation will enforce allowed values in service code
> (F2, F3, F5).

- The schema shall use `String` fields for `TimeOffRequest.status` (default
  `"PENDING"`) with documented allowed values: `PENDING`, `APPROVED`, `REJECTED`,
  `CANCELLED`.
- The schema shall use a `String` field for `BalanceAuditEntry.reason` with
  documented allowed values: `RESERVATION`, `RESERVATION_RELEASE`,
  `APPROVAL_DEDUCTION`, `CANCELLATION_RESTORE`, `BATCH_SYNC`,
  `MANUAL_ADJUSTMENT`.

### Schema — Balance Model

- The schema shall define a `Balance` model with fields: `id` (UUID PK),
  `employeeId` (String), `locationId` (String), `availableDays` (Int, default 0),
  `reservedDays` (Int, default 0), `createdAt` (DateTime, auto), `updatedAt`
  (DateTime, auto).
- The schema shall enforce a unique constraint on `(employeeId, locationId)`.
- The schema shall define an index on `employeeId` for employee-level balance queries.

### Schema — TimeOffRequest Model

- The schema shall define a `TimeOffRequest` model with fields: `id` (UUID PK),
  `employeeId` (String), `locationId` (String), `startDate` (DateTime),
  `endDate` (DateTime), `status` (String, default `"PENDING"`),
  `createdAt` (DateTime, auto), `updatedAt` (DateTime, auto).
- The schema shall define an index on `(employeeId, status)` for filtered listing.

### Schema — BalanceAuditEntry Model

- The schema shall define a `BalanceAuditEntry` model with fields: `id` (UUID PK),
  `balanceId` (String, FK → Balance), `requestId` (String?, nullable FK →
  TimeOffRequest), `delta` (Int), `reason` (String), `reference`
  (String?), `actorId` (String?), `createdAt` (DateTime, auto).
- The schema shall define a relation from `BalanceAuditEntry.balanceId` to
  `Balance.id`.
- The schema shall define an optional relation from `BalanceAuditEntry.requestId`
  to `TimeOffRequest.id`.
- The schema shall define an index on `(balanceId, createdAt)` for chronological
  history queries.

### Migration

- When `prisma migrate dev` is run, the system shall produce a single migration
  that creates all three tables, all indexes, and all foreign keys.

### Backward Compatibility

- The existing `ServiceMetadata` model shall remain unchanged.
- While the new models exist in the schema, existing unit and integration tests
  shall continue to pass without modification.

### Testing

- The system shall include a unit test that asserts the Prisma client type exposes
  model delegates for `balance`, `timeOffRequest`, and `balanceAuditEntry`.
- The system shall include an integration test that creates a Balance, a
  TimeOffRequest, and a BalanceAuditEntry with a relation to both, then reads them
  back to confirm the migration, FK constraints, and unique constraint are functional.

## Out of Scope

- Balance read/write service logic (F2)
- Audit trail service logic (F3)
- HCM client methods (F4)
- Time-off request creation or validation (F5)
- Any REST endpoints
- Seed data or fixtures
