# F7 — HCM Batch Balance Sync Specification

## Context

The HCM system is the source of truth for employee balances. In addition to real-time
balance queries and request submissions (F4), the HCM can push the full corpus of
balances to this service via a batch sync. This handles cases where balances change
outside the service's control — work anniversaries, year-start refreshes, manual HCM
adjustments — ensuring local state stays aligned.

The `Balance`, `BalanceAuditEntry`, and `TimeOffRequest` Prisma models (F1),
`BalanceService` (F2), `BalanceAuditService` (F3), and `HcmClient` (F4) are all
prerequisites and available on `main`.

## Design Decisions

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

## API Contract

### `POST /sync/batch`

**Request body:**

```json
{
  "balances": [
    { "employeeId": "e1", "locationId": "l1", "availableDays": 10 }
  ]
}
```

Constraints:
- `balances` must be a non-empty array
- `employeeId` and `locationId` must be non-empty strings
- `availableDays` must be a non-negative integer

**Response 200:**

```json
{
  "summary": {
    "created": 2,
    "updated": 3,
    "unchanged": 1,
    "conflicted": 1,
    "failed": 0
  },
  "conflicts": [
    {
      "employeeId": "e1",
      "locationId": "l1",
      "pendingRequestIds": ["req-1", "req-2"]
    }
  ],
  "errors": [
    {
      "employeeId": "e2",
      "locationId": "l2",
      "message": "Unexpected error processing entry"
    }
  ]
}
```

Notes:
- `conflicted` counts entries that were applied but have at least one PENDING request.
  A single entry can be both `updated` (or `created`) and `conflicted`.
- `unchanged` counts entries whose `availableDays` matched the local value exactly — skipped with no audit or conflict check.
- `failed` counts entries where processing threw an unexpected error.
- `errors` items correspond 1:1 with `failed` count.

## Data Flow Per Entry

For each `{ employeeId, locationId, availableDays }` in the payload:

1. **Upsert** — `BalanceService.upsertBalance(eid, lid, days)` returns
   `{ balance, previousAvailableDays, wasCreated }`.
2. **Skip if unchanged** — if `!wasCreated && previousAvailableDays === availableDays`,
   skip audit and conflict check. Increment `unchanged`.
3. **Audit** — call `BalanceAuditService.recordEntry({ balanceId, delta, reason: 'BATCH_SYNC', reference: 'HCM batch sync' })`
   where `delta = availableDays - previousAvailableDays` (for created: `delta = availableDays`).
4. **Conflict check** — query `TimeOffRequest` for PENDING requests matching the
   `employeeId` + `locationId`. If any found, add to the conflicts list.
5. **Count** — increment `created` or `updated` (and separately `conflicted` if applicable).
6. **On error** — catch, increment `failed`, add to errors list, continue to next entry.

## EARS Requirements

### `BalanceService.upsertBalance`

- When called with a new `(employeeId, locationId)` pair, the system shall create a
  new `Balance` record with `availableDays` set to the provided value and
  `reservedDays` set to `0`, and shall return `{ balance, previousAvailableDays: 0, wasCreated: true }`.
- When called with an existing `(employeeId, locationId)` pair, the system shall update
  `availableDays` to the provided value and shall return
  `{ balance, previousAvailableDays: <prior value>, wasCreated: false }`.
- The operation shall execute within a single Prisma transaction.

### `BatchSyncService.syncBatch`

- When processing a batch entry for a new balance, the system shall create the balance,
  record a `BATCH_SYNC` audit entry, perform a conflict check, and increment `created`.
- When processing a batch entry whose value is unchanged from the local record, the
  system shall skip the entry without recording an audit entry or performing a conflict
  check, and shall increment `unchanged`.
- When processing a batch entry with a changed value, the system shall update the
  balance, record a `BATCH_SYNC` audit entry with the correct delta, perform a conflict
  check, and increment `updated`.
- When a conflict check finds one or more PENDING `TimeOffRequest` records for the
  affected `(employeeId, locationId)`, the system shall add an entry to the conflicts
  list with `employeeId`, `locationId`, and the list of pending request IDs, and
  increment `conflicted`.
- When processing an entry throws an unexpected error, the system shall catch the error,
  add an entry to the errors list, increment `failed`, and continue processing
  remaining entries.
- After processing all entries, the system shall return a `BatchSyncResult` containing
  `summary`, `conflicts`, and `errors`.

### `SyncController.syncBatch` (`POST /sync/batch`)

- When called with a valid request body, the system shall pass the `balances` array
  to `BatchSyncService.syncBatch` and return the result with HTTP status 200.
- When called with an empty `balances` array, the system shall return HTTP status 400.
- When called with any `balances` entry missing `employeeId`, `locationId`, or
  `availableDays`, the system shall return HTTP status 400.
- When called with a negative `availableDays` value, the system shall return HTTP
  status 400.

### Mock HCM Server — `GET /balances`

- When the mock server receives `GET /balances`, it shall respond with HTTP status 200
  and a JSON body `{ balances: [ { employeeId, locationId, availableDays } ] }` for
  all seeded balances.
- When no balances are seeded, it shall respond with `{ balances: [] }`.

## File Layout

| File | Action |
|---|---|
| `src/core/services/balance.service.ts` | Add `upsertBalance()` method |
| `src/core/services/balance.service.spec.ts` | Add unit tests for `upsertBalance` |
| `src/core/services/batch-sync.service.ts` | New — batch sync orchestration |
| `src/core/services/batch-sync.service.spec.ts` | New — unit tests |
| `src/http/controllers/sync.controller.ts` | New — `POST /sync/batch` |
| `src/http/controllers/sync.controller.spec.ts` | New — unit tests |
| `src/http/dto/batch-sync.dto.ts` | New — request + response DTOs |
| `src/module/providers.ts` | Add `BatchSyncService` |
| `src/module/controllers.ts` | Add `SyncController` |
| `test/support/mock-hcm-server.ts` | Add `GET /balances` handler |
| `test/integration/batch-sync.integration-spec.ts` | New — integration tests |

## Testing

### Unit — `BalanceService.upsertBalance`

- New pair → creates record, returns `wasCreated: true`, `previousAvailableDays: 0`
- Existing pair → updates `availableDays`, returns `wasCreated: false`, correct prior value

### Unit — `BatchSyncService.syncBatch`

- New balance → `created: 1`, audit recorded, `delta = availableDays`
- Unchanged balance → `unchanged: 1`, no audit recorded
- Changed balance → `updated: 1`, audit recorded with correct delta
- Changed balance + PENDING request → `updated: 1`, `conflicted: 1`, conflict in list
- Entry throws → `failed: 1`, error in list, loop continues to next entry
- Multiple entries → all outcomes accumulated correctly

### Unit — `SyncController`

- Valid body → calls `syncBatch`, returns result with 200
- Empty `balances` array → 400
- Entry with negative `availableDays` → 400
- Missing required field → 400

### Integration

1. **All new** — 3 new balances in payload → `created: 3`, verify records in DB, mock HCM `GET /balances` used as payload source
2. **All unchanged** — post same values again → `unchanged: 3`, `created: 0, updated: 0`
3. **All updated** — change values → `updated: 3`, audit entries verifiable via `GET /balances/:eid/:lid/history`
4. **PENDING conflict** — existing balance + a PENDING request → conflict in response, balance updated
5. **Mixed** — combination of new + updated + unchanged + conflicted in one payload
6. **Invalid DTO** — empty array → 400

## Out of Scope

- Authentication / authorization for the sync endpoint
- Rate limiting or idempotency keys
- Polling-based sync (service calling HCM instead of HCM pushing)
- Partial-payload retries
- Time-off request cancellation due to conflicting balance drop (F10)
