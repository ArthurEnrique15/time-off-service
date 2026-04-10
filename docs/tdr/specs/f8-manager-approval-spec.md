# F8 — Manager Approval: Specification

## Context

Managers review PENDING time-off requests and either approve or reject them. On approval
the reserved balance is confirmed (moved from reserved to consumed). On rejection the
reservation is released (reserved days returned to available). Both actions are audit-logged.

This feature depends on:
- F1 (Domain Models) — `TimeOffRequest`, `Balance`, `BalanceAuditEntry` Prisma models
- F2 (Balance Management) — `BalanceService` with `confirmDeductionInTx` and `releaseReservationInTx`
- F3 (Balance Audit Trail) — `BalanceAuditService.recordEntryInTx()` with `APPROVAL_DEDUCTION` and `RESERVATION_RELEASE` reasons
- F5 (Time-Off Request Create) — `TimeOffRequest` records in `PENDING` status

## EARS Requirements

### Approve

- When `PATCH /time-off-requests/:id/approve` is called and the request does not exist,
  the system shall return a `404` response.
- When `PATCH /time-off-requests/:id/approve` is called and the request status is not
  `PENDING`, the system shall return a `409` response.
- When `PATCH /time-off-requests/:id/approve` is called on a `PENDING` request, the system
  shall atomically (inside a single Prisma transaction):
  - Update the `TimeOffRequest` status to `APPROVED`
  - Call `BalanceService.confirmDeductionInTx()` (decrements `reservedDays`)
  - Call `BalanceAuditService.recordEntryInTx()` with `reason: 'APPROVAL_DEDUCTION'`,
    `delta: -daysRequested`, `balanceId`, `requestId`, and the forwarded `actorId` (if provided)
- The system shall return a `200` response with the updated `TimeOffRequest` as JSON.

### Reject

- When `PATCH /time-off-requests/:id/reject` is called and the request does not exist,
  the system shall return a `404` response.
- When `PATCH /time-off-requests/:id/reject` is called and the request status is not
  `PENDING`, the system shall return a `409` response.
- When `PATCH /time-off-requests/:id/reject` is called on a `PENDING` request, the system
  shall atomically (inside a single Prisma transaction):
  - Update the `TimeOffRequest` status to `REJECTED`
  - Call `BalanceService.releaseReservationInTx()` (decrements `reservedDays`, increments `availableDays`)
  - Call `BalanceAuditService.recordEntryInTx()` with `reason: 'RESERVATION_RELEASE'`,
    `delta: +daysRequested`, `balanceId`, `requestId`, and the forwarded `actorId` (if provided)
- The system shall return a `200` response with the updated `TimeOffRequest` as JSON.

### Request Body

- Both endpoints shall accept an optional `actorId` string field in the request body.
- When `actorId` is present, the system shall forward it to `BalanceAuditService.recordEntry()`.
- When `actorId` is absent, the system shall call `BalanceAuditService.recordEntry()` without it.

## Error HTTP Status Summary

| Condition | HTTP Status |
|---|---|
| Request not found | 404 |
| Request status is not PENDING | 409 |
| Happy path (approve or reject) | 200 |

## Testing Requirements

### Unit Tests — `TimeOffRequestService`

- Approve happy path: PENDING request found → status updated to APPROVED, `confirmDeductionInTx` called, `recordEntryInTx` called with `APPROVAL_DEDUCTION`.
- Approve with `actorId`: `actorId` forwarded to `recordEntry`.
- Approve not found → `NotFoundException` thrown.
- Approve non-PENDING → `ConflictException` thrown.
- Reject happy path: PENDING request found → status updated to REJECTED, `releaseReservationInTx` called, `recordEntryInTx` called with `RESERVATION_RELEASE`.
- Reject with `actorId`: `actorId` forwarded to `recordEntry`.
- Reject not found → `NotFoundException` thrown.
- Reject non-PENDING → `ConflictException` thrown.

### Unit Tests — `TimeOffRequestController`

- `approve()` delegates to service and returns the result with HTTP 200.
- `reject()` delegates to service and returns the result with HTTP 200.

### Integration Tests — `PATCH /time-off-requests/:id/approve`

- Happy path: seeded PENDING request + balance → 200, status APPROVED in DB, `reservedDays` decremented, audit entry with `APPROVAL_DEDUCTION` created.
- Request not found → 404.
- Request already APPROVED → 409.
- Request already REJECTED → 409.
- With `actorId` in body → audit entry carries the `actorId`.

### Integration Tests — `PATCH /time-off-requests/:id/reject`

- Happy path: seeded PENDING request + balance → 200, status REJECTED in DB, `reservedDays` decremented and `availableDays` incremented, audit entry with `RESERVATION_RELEASE` created.
- Request not found → 404.
- Request already APPROVED → 409.
- Request already REJECTED → 409.
- With `actorId` in body → audit entry carries the `actorId`.

## Out of Scope

- HCM notification on approval (F9)
- Cancellation (F10)
- Authentication / authorization — `actorId` is an optional caller-supplied string; no auth middleware is in scope
- Listing or reading requests (F6)
