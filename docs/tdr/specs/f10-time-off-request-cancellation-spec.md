# F10 — Time-Off Request Cancellation Specification

## Context

Managers need to cancel previously approved time-off requests. Cancellation must
keep the local service and HCM aligned, restore the employee's available balance,
and write an audit entry describing the restoration.

This feature depends on:
- F3 (Balance Audit Trail) — `BalanceAuditService.recordEntryInTx()` with
  `CANCELLATION_RESTORE`
- F4 (HCM Client) — `HcmClient.cancelTimeOff()` returning
  `Either<HcmError, void>`
- F5 (Time-Off Request Create) — `hcmRequestId` persisted on requests
- F8 (Manager Approval) — `APPROVED` requests and audit actor pattern

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Cancellation flow | Remote-first | HCM is authoritative for cancellation; local state should not diverge first |
| Eligible status | `APPROVED` only | Matches the roadmap and prevents cancelling tentative or already-finalized requests |
| Missing `hcmRequestId` | `409 Conflict` | An approved local request without a remote identifier is a state mismatch |
| Request body | Optional `actorId` string | Reuses the established approval/reject pattern |
| HCM `NOT_FOUND` handling | `409 Conflict`, no local mutation | Signals state mismatch between local and HCM records |
| HCM `UNKNOWN` handling | `503 Service Unavailable`, no local mutation | Downstream failure should not change local state |

## EARS Requirements

### Cancel Endpoint

- When `PATCH /time-off-requests/:id/cancel` is called and the request does not
  exist, the system shall return a `404` response.
- When `PATCH /time-off-requests/:id/cancel` is called and the request status is
  not `APPROVED`, the system shall return a `409` response.
- When `PATCH /time-off-requests/:id/cancel` is called for an `APPROVED` request
  whose `hcmRequestId` is missing, the system shall return a `409` response.
- When `PATCH /time-off-requests/:id/cancel` is called for an eligible request,
  the system shall call `HcmClient.cancelTimeOff(hcmRequestId)` before any local
  database mutation occurs.
- When `HcmClient.cancelTimeOff()` returns `Success`, the system shall atomically
  (inside a single Prisma transaction):
  - Update the `TimeOffRequest` status to `CANCELLED`
  - Call `BalanceService.restoreBalanceInTx()` to increment `availableDays` by
    `daysRequested`
  - Call `BalanceAuditService.recordEntryInTx()` with
    `reason: 'CANCELLATION_RESTORE'`, `delta: +daysRequested`, `balanceId`,
    `requestId`, and the forwarded `actorId` when provided
- The system shall return a `200` response with the updated `TimeOffRequest` as
  JSON after the transaction commits.

### Request Body

- The cancel endpoint shall accept an optional `actorId` string field in the
  request body.
- When `actorId` is present, the system shall forward it to
  `BalanceAuditService.recordEntryInTx()`.
- When `actorId` is absent, the system shall call
  `BalanceAuditService.recordEntryInTx()` without it.

### HCM Failure Mapping

- When `HcmClient.cancelTimeOff()` returns `Failure` with code `NOT_FOUND`, the
  system shall return a `409` response and leave the local request and balance
  unchanged.
- When `HcmClient.cancelTimeOff()` returns `Failure` with code `UNKNOWN`, the
  system shall return a `503` response and leave the local request and balance
  unchanged.

## Error HTTP Status Summary

| Condition | HTTP Status |
|---|---|
| Request not found | 404 |
| Request status is not `APPROVED` | 409 |
| `hcmRequestId` missing on approved request | 409 |
| HCM returns `NOT_FOUND` | 409 |
| HCM returns `UNKNOWN` | 503 |
| Successful cancellation | 200 |

## Testing Requirements

### Unit Tests — `TimeOffRequestService`

- Cancel happy path: APPROVED request found, HCM cancellation succeeds, request
  status updated to `CANCELLED`, `restoreBalanceInTx()` called, and
  `recordEntryInTx()` called with `CANCELLATION_RESTORE`.
- Cancel with `actorId`: `actorId` forwarded to audit logging.
- Cancel not found → `NotFoundException` thrown.
- Cancel non-APPROVED (`PENDING`, `REJECTED`, `CANCELLED`) → `ConflictException`
  thrown.
- Cancel approved request missing `hcmRequestId` → `ConflictException` thrown.
- HCM `NOT_FOUND` → `ConflictException` thrown and no Prisma transaction started.
- HCM `UNKNOWN` → `ServiceUnavailableException` thrown and no Prisma
  transaction started.

### Unit Tests — `TimeOffRequestController`

- `cancel()` delegates to service and returns the result with HTTP 200.
- `cancel()` forwards the optional `actorId`.

### Unit Tests — `BalanceService`

- `restoreBalanceInTx()` increments `availableDays` for an existing balance.
- `restoreBalanceInTx()` throws `NotFoundException` when the balance does not
  exist.

### Integration Tests — `PATCH /time-off-requests/:id/cancel`

- Happy path: approved request + HCM request exists → 200, status `CANCELLED`,
  `availableDays` restored, audit entry with `CANCELLATION_RESTORE` created.
- With `actorId` in body → audit entry carries the `actorId`.
- Request not found → 404.
- Request still `PENDING` → 409.
- Request already `REJECTED` → 409.
- Request already `CANCELLED` → 409.
- Approved request with nonexistent remote HCM request ID → 409 and no local
  mutation.

## Out of Scope

- Approval-time HCM submission redesign (F9 roadmap inconsistency)
- Authentication / authorization
- Free-form cancellation reason
- Retry logic or circuit breaking for HCM failures (F11)
