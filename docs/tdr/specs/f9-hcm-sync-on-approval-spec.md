# F9 — HCM Sync on Approval Specification

## Context

Employees create time-off requests locally in `PENDING` status. Manager approval is the
point where the service attempts to submit the request to HCM. Approval only becomes
final locally after HCM accepts the submission. Business rejections from HCM convert the
request to `REJECTED`; operational failures leave the request `PENDING` so approval can
be retried later.

This feature depends on:
- F1 (Domain Models) — `TimeOffRequest`, `Balance`, `BalanceAuditEntry` Prisma models
- F2 (Balance Management) — `BalanceService` with `confirmDeductionInTx()` and `releaseReservationInTx()`
- F3 (Balance Audit Trail) — `BalanceAuditService.recordEntryInTx()` with `APPROVAL_DEDUCTION`, `RESERVATION_RELEASE`, and `HCM_SYNC` reasons
- F4 (HCM Client) — `HcmClient.submitTimeOff()` returning `Either<HcmError, HcmSubmitResponse>`
- F5 (Time-Off Request Create) — `PENDING` local requests with reserved balance
- F8 (Manager Approval) — approve/reject endpoints and actor forwarding

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| HCM submission timing | On manager approval, not on create | Matches roadmap intent and preserves approval as the external commit point |
| Approval orchestration | HCM-first, then local finalization | Avoids transient approval + rollback states for operational failures |
| Business HCM rejection | Convert request to `REJECTED` and release reservation | Terminal domain mismatch; request should not remain retryable |
| Operational HCM failure | Keep request `PENDING` and keep reservation | Retryable failure; caller can try approval again later |
| `hcmRequestId` persistence | Set only after successful HCM submission | Prevents storing external IDs for rejected or unsent approvals |
| Audit of sync outcome | Separate `HCM_SYNC` entry with `delta: 0` | Distinguishes external sync results from balance mutations |

## EARS Requirements

### Create Request Contract Alignment

- When `POST /time-off-requests` succeeds, the system shall create a local
  `TimeOffRequest` with status `PENDING` and shall not call `HcmClient.submitTimeOff()`.
- When `POST /time-off-requests` succeeds, the system shall leave `hcmRequestId` unset.

### Approve — Common Guards

- When `PATCH /time-off-requests/:id/approve` is called and the request does not exist,
  the system shall return a `404` response.
- When `PATCH /time-off-requests/:id/approve` is called and the request status is not
  `PENDING`, the system shall return a `409` response.

### Approve — HCM Success

- When `PATCH /time-off-requests/:id/approve` is called on a `PENDING` request, the
  system shall call `HcmClient.submitTimeOff()` with `{ employeeId, locationId, startDate, endDate }`
  derived from the stored request.
- When `submitTimeOff()` returns `Success`, the system shall atomically:
  - Update the `TimeOffRequest` status to `APPROVED`
  - Persist the returned `hcmRequestId` on the request
  - Call `BalanceService.confirmDeductionInTx()` for `daysRequested`
  - Call `BalanceAuditService.recordEntryInTx()` with `reason: 'APPROVAL_DEDUCTION'`,
    `delta: -daysRequested`, `balanceId`, `requestId`, and optional `actorId`
  - Call `BalanceAuditService.recordEntryInTx()` with `reason: 'HCM_SYNC'`,
    `delta: 0`, `requestId`, optional `actorId`, and a `reference` describing the
    approval sync success
- The system shall return a `200` response with the updated `TimeOffRequest` as JSON.

### Approve — HCM Business Rejection

- When `submitTimeOff()` returns `Failure` with code `INSUFFICIENT_BALANCE`, the system
  shall atomically:
  - Update the `TimeOffRequest` status to `REJECTED`
  - Call `BalanceService.releaseReservationInTx()` for `daysRequested`
  - Call `BalanceAuditService.recordEntryInTx()` with `reason: 'RESERVATION_RELEASE'`,
    `delta: +daysRequested`, `balanceId`, `requestId`, and optional `actorId`
  - Call `BalanceAuditService.recordEntryInTx()` with `reason: 'HCM_SYNC'`,
    `delta: 0`, `requestId`, optional `actorId`, and a `reference` describing the
    approval sync rejection and HCM code
- The system shall return a `400` response.
- When `submitTimeOff()` returns `Failure` with code `INVALID_DIMENSIONS`, the system
  shall perform the same local rejection and reservation-release flow and shall return a
  `422` response.

### Approve — HCM Operational Failure

- When `submitTimeOff()` returns `Failure` with code `UNKNOWN`, the system shall:
  - Leave the `TimeOffRequest` status as `PENDING`
  - Leave the reserved balance unchanged
  - Leave `hcmRequestId` unset
  - Call `BalanceAuditService.recordEntryInTx()` or `recordEntry()` with
    `reason: 'HCM_SYNC'`, `delta: 0`, `requestId`, optional `actorId`, and a
    `reference` describing the approval sync operational failure
- The system shall return a `503` response.

### Reject

- `PATCH /time-off-requests/:id/reject` shall remain a local-only operation.
- When `PATCH /time-off-requests/:id/reject` succeeds, the system shall not call
  `HcmClient.submitTimeOff()`.

## Error HTTP Status Summary

| Condition | HTTP Status |
|---|---|
| Request not found | 404 |
| Request status is not `PENDING` | 409 |
| HCM `INSUFFICIENT_BALANCE` on approval | 400 |
| HCM `INVALID_DIMENSIONS` on approval | 422 |
| HCM `UNKNOWN` on approval | 503 |
| Approval success | 200 |

## Testing Requirements

### Unit Tests — `TimeOffRequestService`

- `create()` happy path: reserves locally, records `RESERVATION`, does not call HCM, stores `hcmRequestId` as `null` / unset.
- `approve()` success: calls HCM, stores returned `hcmRequestId`, updates status to `APPROVED`, confirms deduction, records `APPROVAL_DEDUCTION` and `HCM_SYNC`.
- `approve()` with `INSUFFICIENT_BALANCE`: updates status to `REJECTED`, releases reservation, records `RESERVATION_RELEASE` and `HCM_SYNC`, throws `BadRequestException`.
- `approve()` with `INVALID_DIMENSIONS`: same local rollback path, throws `UnprocessableEntityException`.
- `approve()` with `UNKNOWN`: leaves request retryable, does not change balance, records `HCM_SYNC`, throws `ServiceUnavailableException`.
- `reject()` remains local-only and does not call HCM.

### Unit Tests — `TimeOffRequestController`

- `create()` delegates to service and returns HTTP `201`.
- `approve()` delegates to service and propagates `400`, `422`, `503`, `404`, and `409` from the service.
- `reject()` remains unchanged.

### Unit Tests — `BalanceAuditService`

- `HCM_SYNC` is accepted as a valid audit reason for write and history filtering paths.

### Integration Tests

- `POST /time-off-requests` happy path: returns `201`, stores `PENDING`, leaves `hcmRequestId` null, decrements `availableDays`, increments `reservedDays`, creates a `RESERVATION` audit entry.
- `POST /time-off-requests` shall not depend on HCM approval or HCM-specific rejection mapping.
- `PATCH /time-off-requests/:id/approve` success: status becomes `APPROVED`, `hcmRequestId` is stored, `reservedDays` is decremented, `APPROVAL_DEDUCTION` and `HCM_SYNC` entries exist.
- `PATCH /time-off-requests/:id/approve` with HCM `INSUFFICIENT_BALANCE`: returns `400`, status becomes `REJECTED`, reservation is released, `RESERVATION_RELEASE` and `HCM_SYNC` entries exist.
- `PATCH /time-off-requests/:id/approve` with HCM `INVALID_DIMENSIONS`: returns `422`, status becomes `REJECTED`, reservation is released.
- `PATCH /time-off-requests/:id/approve` with HCM `UNKNOWN`: returns `503`, status remains `PENDING`, reservation remains in place, `HCM_SYNC` entry exists.
- `PATCH /time-off-requests/:id/reject` remains local-only.

## Out of Scope

- Approval retries/backoff policies beyond returning `503`
- New request statuses beyond `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`
- Cancellation flow changes (F10)
- Cross-request reconciliation jobs or background recovery
