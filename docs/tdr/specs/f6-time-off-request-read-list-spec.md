# F6 — Time-Off Request Read & List Specification

## Context

The time-off service manages the lifecycle of time-off requests. This feature
adds the read-only access layer: a single-record lookup by ID and a paginated,
filterable employee list. It has no dependencies beyond F1 (domain models)
and can be delivered in Phase 2 in parallel with F2, F3, and F4.

The `TimeOffRequest` Prisma model already exists. This feature adds the
application-layer service and two REST endpoints on top of it.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Pagination | Offset/limit (`page`, `limit`) | Employees accumulate many requests; consistent with F3 audit trail |
| Extra filters | None beyond `employeeId` + optional `status` | YAGNI; date range can be added in F11 if needed |
| Default sort | Descending by `createdAt` (most-recent first) | Consistent with F3 audit trail; most useful default |
| Invalid status value | HTTP 400 | Consistent with F3 invalid-reason behavior; fail fast |
| Missing `employeeId` on list | HTTP 400 | Consistent with F2 balance list |
| Single request not found | HTTP 404 | Standard REST |
| Inline validation | In controller, no class-validator DTOs | Matches every existing controller in the codebase |
| `page`/`limit` out of range | Default / cap (1..100) | Matches F3 behavior |
| Paginated response shape | `{ data, pagination: { page, limit, total, totalPages } }` | Consistent with F3 envelope |

## EARS Requirements

### Endpoint — Get Single Request

- When `GET /time-off-requests/:id` is called with a valid ID, the system shall
  return HTTP 200 with the full `TimeOffRequest` record.
- When `GET /time-off-requests/:id` is called with an ID that does not exist,
  the system shall return HTTP 404.

### Endpoint — List Requests

- When `GET /time-off-requests` is called with a valid `employeeId` query
  parameter, the system shall return HTTP 200 with a paginated list of
  `TimeOffRequest` records for that employee.
- When `GET /time-off-requests` is called without an `employeeId` query
  parameter, the system shall return HTTP 400.
- When `GET /time-off-requests` is called with an invalid `status` value
  (not one of `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`), the system
  shall return HTTP 400.

### Endpoint — Status Filter

- When the optional `status` query parameter is provided with a valid value,
  the system shall filter the results to only requests matching that status.
- When the `status` query parameter is absent, the system shall return requests
  of all statuses.

### Endpoint — Pagination

- The system shall accept an optional `page` query parameter (default: 1, minimum: 1).
- The system shall accept an optional `limit` query parameter (default: 20,
  minimum: 1, maximum: 100).
- The system shall return the response in the shape:
  `{ data: TimeOffRequest[], pagination: { page, limit, total, totalPages } }`.

### Endpoint — Sort Order

- The system shall sort list results in descending order by `createdAt`
  (most-recent first).

### Edge Cases

- When an employee exists but has no requests, the system shall return HTTP 200
  with `{ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } }`.
- When `page` or `limit` are non-numeric or less than 1, the system shall
  default them to 1 and 20 respectively.
- When `limit` exceeds 100, the system shall cap it at 100.

### Backward Compatibility

- The existing unit and integration tests shall continue to pass without
  modification.

### Testing

- The system shall include unit tests for the service covering: findById found,
  findById not found (returns null), findAllByEmployee with no results, with
  results, with status filter, pagination defaults, limit cap, and descending
  sort order.
- The system shall include unit tests for the controller covering: delegation
  to service, query param parsing, missing `employeeId` → 400, invalid
  `status` → 400, non-found ID → 404, and default pagination values.
- The system shall include integration tests covering: 404 for unknown ID,
  200 with correct shape for existing request, 400 for missing `employeeId`,
  400 for invalid status, 200 empty list, 200 with results, pagination,
  status filter, and descending sort order.

## Out of Scope

- Write endpoints (create, update, cancel — F5, F8, F10)
- Date range filter (F11 hardening)
- Authentication / authorization
- Cross-employee queries
