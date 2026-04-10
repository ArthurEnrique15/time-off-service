# F3 — Balance Audit Trail Specification

## Context

The time-off service needs an audit trail that records every balance change with full
context — who changed it, why, by how much, and which entity triggered the change.
Downstream features (F5 create, F7 batch sync, F8 approval, F9 HCM sync, F10
cancellation) will call an internal service method to log their changes. A single
REST endpoint exposes the paginated audit history for a given balance.

The `BalanceAuditEntry` Prisma model already exists (F1). This feature adds the
application-layer service and read endpoint on top of it.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Audit write surface | Internal service method only | No external POST; downstream features inject the service |
| History pagination | Offset/limit (`page`, `limit`) | Simple, matches typical REST APIs |
| History default sort | Descending by `createdAt` | Most-recent-first is the natural audit view |
| History reason filter | Optional `?reason=` query param | Allows callers to narrow by change type |
| Balance not found | HTTP 404 | Clear signal vs. ambiguous empty array |
| Reason constant location | Exported from the service file | Single source of truth; extract later if needed |
| Paginated response shape | `{ data, pagination: { page, limit, total, totalPages } }` | Standard offset/limit envelope |

## EARS Requirements

### Service — Record Entry

- When a balance change occurs, the system shall create a `BalanceAuditEntry` with
  the provided `balanceId`, `delta`, `reason`, and optional `requestId`, `reference`,
  and `actorId` fields, with `createdAt` set automatically.
- The system shall validate that the `reason` value is one of the allowed constants:
  `RESERVATION`, `RESERVATION_RELEASE`, `APPROVAL_DEDUCTION`, `CANCELLATION_RESTORE`,
  `BATCH_SYNC`, `HCM_SYNC`, `MANUAL_ADJUSTMENT`.
- If the `reason` value is not one of the allowed constants, the system shall throw
  an error and not create the entry.

### Endpoint — Read History

- When `GET /balances/:employeeId/:locationId/history` is called, the system shall
  return a paginated list of `BalanceAuditEntry` records for the balance matching
  the given `employeeId` and `locationId`.
- The system shall sort results in descending order by `createdAt` (most recent first).

### Endpoint — Pagination

- The system shall accept an optional `page` query parameter (default: 1, minimum: 1).
- The system shall accept an optional `limit` query parameter (default: 20, minimum: 1,
  maximum: 100).
- The system shall return the response in the shape:
  `{ data: BalanceAuditEntry[], pagination: { page, limit, total, totalPages } }`.

### Endpoint — Reason Filter

- When the optional `reason` query parameter is provided, the system shall filter
  the audit entries to only those whose `reason` matches the given value.
- If the provided `reason` value is not one of the allowed constants, the system
  shall return HTTP 400.

### Endpoint — Balance Not Found

- If no `Balance` record exists for the given `employeeId` and `locationId`, the
  system shall return HTTP 404.

### Backward Compatibility

- The existing unit and integration tests shall continue to pass without modification.

### Testing

- The system shall include unit tests for the service covering: entry creation,
  reason validation rejection, balance-not-found error, pagination defaults,
  limit cap, reason filter, and descending sort order.
- The system shall include unit tests for the controller covering: delegation to the
  service, query parameter parsing, and default values.
- The system shall include integration tests covering: 404 for missing balance,
  empty history, correct sort order, pagination, and reason filter — all via HTTP.

## Out of Scope

- REST endpoint for creating audit entries (write is internal only)
- Audit entry deletion or modification
- Cross-balance audit queries (e.g., all entries for an employee)
- Authentication or authorization
