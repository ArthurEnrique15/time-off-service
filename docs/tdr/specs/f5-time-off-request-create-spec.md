# F5 — Time-Off Request Create & Validate Specification

## Context

Employees submit time-off requests specifying an employee ID, location ID, start date,
and end date. The service validates the request locally (balance availability) and against
the HCM system in real time. If both validations pass, a `TimeOffRequest` record is
created in `PENDING` status, the balance is tentatively reserved, and an audit entry is
logged. The HCM's own request ID is persisted on the local record so downstream features
(F10 cancellation) can reference it.

This feature depends on:
- F1 (Domain Models) — `TimeOffRequest`, `Balance`, `BalanceAuditEntry` Prisma models
- F2 (Balance Management) — `BalanceService` with `reserve()` and read methods
- F3 (Balance Audit Trail) — `BalanceAuditService.recordEntry()` with `RESERVATION` reason
- F4 (HCM Client) — `HcmClient.submitTimeOff()` returning `Either<HcmError, HcmSubmitResponse>`

## Design Decisions

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

## Schema Change

Add `hcmRequestId` to the `TimeOffRequest` model:

```prisma
model TimeOffRequest {
  ...
  hcmRequestId String?   // ID returned by HCM on submitTimeOff; used by F10 cancellation
  ...
}
```

A new Prisma migration must be generated and committed.

## EARS Requirements

### Input Validation

- When a client sends `POST /time-off-requests` with a missing or non-string `employeeId`,
  `locationId`, `startDate`, or `endDate` field, the system shall return a `400` response
  with validation error details.
- When `startDate` or `endDate` are not parseable as ISO-8601 date strings (YYYY-MM-DD)
  via `date-fns/parseISO`, the system shall return a `400` response.
- When `parseISO(startDate)` is after `parseISO(endDate)` (checked via `date-fns/isAfter`),
  the system shall return a `400` response.

### Local Balance Check

- When `POST /time-off-requests` is received with valid input, the system shall compute
  `daysRequested = differenceInCalendarDays(parseISO(endDate), parseISO(startDate)) + 1`
  using `date-fns`, then retrieve
  the local `Balance` for `(employeeId, locationId)`.
- When no local `Balance` exists for the given `(employeeId, locationId)`, the system shall
  return a `404` response.
- When the local `Balance.availableDays` is less than the computed `daysRequested`, the
  system shall return a `400` response before calling HCM.

### HCM Validation

- When the local balance check passes, the system shall call `HcmClient.submitTimeOff()`
  with `{ employeeId, locationId, startDate, endDate }`.
- When `submitTimeOff` returns `Failure` with code `INSUFFICIENT_BALANCE`, the system shall
  return a `400` response.
- When `submitTimeOff` returns `Failure` with code `INVALID_DIMENSIONS`, the system shall
  return a `422` response.
- When `submitTimeOff` returns `Failure` with code `UNKNOWN`, the system shall return a
  `503` response.

### Request Creation

- When `submitTimeOff` returns `Success`, the system shall atomically:
  - Call `BalanceService.reserve(employeeId, locationId, daysRequested)`
  - Create a `TimeOffRequest` record with status `PENDING`, the provided dates, and the
    HCM-returned `hcmRequestId`
- After the transaction commits, the system shall call `BalanceAuditService.recordEntry()`
  with `reason: 'RESERVATION'`, `delta: -daysRequested`, `balanceId`, and `requestId`.
- The system shall return a `201` response with the created `TimeOffRequest` as JSON.

### Module Registration

- `TimeOffRequestService` shall be provided in the `TimeOffModule`.
- `TimeOffRequestController` shall be registered in the `TimeOffModule`.
- `HcmModule` shall be imported by `TimeOffModule` to make `HcmClient` available.

## Error HTTP Status Summary

| Condition | HTTP Status |
|---|---|
| Missing or invalid DTO fields | 400 |
| `startDate` > `endDate` | 400 |
| Local balance not found | 404 |
| Insufficient local balance | 400 |
| HCM `INSUFFICIENT_BALANCE` | 400 |
| HCM `INVALID_DIMENSIONS` | 422 |
| HCM `UNKNOWN` (network failure) | 503 |
| All validations pass | 201 |

## Testing Requirements

### Unit Tests — `TimeOffRequestService`

- Happy path: balance found, sufficient, HCM returns `Success` → request created,
  `reserve()` called, `recordEntry()` called with `RESERVATION`.
- Balance not found → `NotFoundException` thrown.
- Insufficient local balance → `InsufficientBalanceError` thrown.
- HCM returns `INSUFFICIENT_BALANCE` → `BadRequestException` thrown.
- HCM returns `INVALID_DIMENSIONS` → `UnprocessableEntityException` thrown.
- HCM returns `UNKNOWN` → `ServiceUnavailableException` thrown.

### Unit Tests — `TimeOffRequestController`

- Delegates to service and returns the result with HTTP 201.

### Integration Tests — `POST /time-off-requests`

- Happy path: seeded balance + mock HCM approves → 201, request in DB with `PENDING` and
  `hcmRequestId`, `availableDays` decremented, `reservedDays` incremented, audit entry
  created.
- Missing required field → 400.
- `startDate` after `endDate` → 400.
- Local insufficient balance → 400.
- HCM mock returns insufficient balance → 400.
- HCM mock returns invalid dimensions → 422.

## Out of Scope

- Reading or listing time-off requests (F6)
- Manager approval / rejection (F8)
- HCM sync on approval (F9)
- Cancellation (F10)
- Batch balance sync (F7)
- Error hardening / retry logic (F11)
