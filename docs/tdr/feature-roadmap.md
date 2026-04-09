# Time-Off Service — Feature Roadmap

## Goal

Complete TODO list of features needed for the time-off microservice to fulfill the
take-home exercise requirements. Organized so multiple agents can work on independent
features simultaneously.

## Scope Decisions

| Decision | Choice |
|---|---|
| Manager approval endpoints | In-scope |
| Balance audit / history trail | In-scope |
| HCM integration | Both real-time and batch sync |
| Employee / location entities | Referenced by ID only (seeded via DB / fixtures) |
| Request cancellation | In-scope |
| API style | REST only |

## Current State (as of 2026-04-08)

The foundation is complete on `main`:

- NestJS scaffold with `src/core`, `src/http`, `src/module`, `src/prisma`, `src/shared`
- Prisma + SQLite with only `ServiceMetadata` model
- `/health` endpoint with HCM + DB connectivity check
- HCM client with `checkConnection()` only
- Mock HCM server for tests (handles `/health` only)
- Full testing infra: Jest, Supertest integration, Stryker mutation
- 100% coverage baseline

## Delivery Notes

Per AGENTS.md, each feature's delivery flow is:

1. Write EARS feature spec → `docs/tdr/specs/`
2. Write implementation plan → `docs/tdr/feature-plans/`
3. Link both from `docs/tdr/master.md`
4. TDD: failing test → implementation → green → refactor
5. Maintain 100% unit coverage, update Stryker targets

---

## Features

### F1 · Domain Models & Prisma Schema

**What:** Define all Prisma models needed for the service and run the migration.

Models:

- `Balance` — per-employee per-location balance (employeeId, locationId, available days, etc.)
- `TimeOffRequest` — the lifecycle entity (employeeId, locationId, days requested, status, dates, etc.)
- `BalanceAuditEntry` — audit trail for every balance change (who, what, why, delta, related entity)

**Dependencies:** None (must come first)

---

### F2 · Balance Management

**What:** Core service and REST endpoints for reading and managing local balances.

Behavior:

- Read a single balance by employee + location
- List all balances for an employee
- Internal balance update operations (used by other features, not exposed directly as write endpoints)

Endpoints:

- `GET /balances?employeeId=X` — list balances for an employee
- `GET /balances/:employeeId/:locationId` — get specific balance

**Dependencies:** F1

---

### F3 · Balance Audit Trail

**What:** Service that logs every balance change with full context.

Behavior:

- Record balance change entries: delta, reason, actor, timestamp, related entity (request ID, sync ID, etc.)
- Read audit history for a balance

Endpoints:

- `GET /balances/:employeeId/:locationId/history` — get balance change history

**Dependencies:** F1

---

### F4 · HCM Client — Real-time Operations

**What:** Extend the existing HcmClient with real-time HCM API methods.

Methods:

- `getBalance(employeeId, locationId)` — fetch current balance from HCM
- `submitTimeOff(request)` — send a time-off request to HCM
- `cancelTimeOff(requestId)` — send a cancellation to HCM

Also:

- Extend the mock HCM server to handle these endpoints for testing
- Handle HCM error responses (invalid dimensions, insufficient balance)

**Dependencies:** F1

---

### F5 · Time-Off Request — Create & Validate

**What:** Create a time-off request with defensive local validation + HCM validation.

Behavior:

- Employee submits a time-off request (employee, location, days/dates)
- Service checks local balance (defensive — don't rely solely on HCM)
- Service validates against HCM real-time API
- If both pass, request is created in PENDING status and balance is tentatively reserved
- If either fails, return clear error

Endpoints:

- `POST /time-off-requests` — create a new request

**Dependencies:** F2, F4

---

### F6 · Time-Off Request — Read & List

**What:** Endpoints to query existing time-off requests.

Behavior:

- Get a single request by ID
- List requests for an employee (with optional status filter)

Endpoints:

- `GET /time-off-requests/:id` — get request details
- `GET /time-off-requests?employeeId=X&status=Y` — list requests

**Dependencies:** F1

---

### F7 · HCM Batch Balance Sync

**What:** Endpoint to receive batch balance data from HCM and reconcile with local state.

Behavior:

- HCM sends the full corpus of balances (all employees, all locations)
- Service ingests, compares with local balances, updates as needed
- All changes logged to audit trail with reason "batch sync"
- Handle conflicts: if a pending request exists for a balance that changed, flag/handle it

Endpoints:

- `POST /sync/batch` — receive batch balance payload from HCM

Also:

- Extend mock HCM server with batch endpoint support for testing

**Dependencies:** F2, F3, F4

---

### F8 · Time-Off Request — Manager Approval

**What:** Manager can approve or reject pending time-off requests.

Behavior:

- Approve: status → APPROVED, deduct balance, log to audit trail
- Reject: status → REJECTED, release tentative reservation, log to audit trail
- Only PENDING requests can be approved/rejected

Endpoints:

- `PATCH /time-off-requests/:id/approve`
- `PATCH /time-off-requests/:id/reject`

**Dependencies:** F5, F3

---

### F9 · Time-Off Request — HCM Sync on Approval

**What:** After manager approves, submit the request to HCM.

Behavior:

- On approval, call HCM submitTimeOff
- Handle HCM rejection post-approval (error recovery: rollback local balance, update status)
- Log sync result to audit trail

**Dependencies:** F8, F4

---

### F10 · Time-Off Request — Cancellation

**What:** Cancel a previously approved time-off request.

Behavior:

- Cancel: status → CANCELLED, restore balance, log to audit trail
- Sync cancellation to HCM via cancelTimeOff
- Handle HCM rejection of cancellation (error recovery)
- Only APPROVED requests can be cancelled

Endpoints:

- `PATCH /time-off-requests/:id/cancel`

**Dependencies:** F8, F3, F4

---

### F11 · Error Handling & Defensive Validation Hardening

**What:** Cross-cutting hardening pass across all features.

Behavior:

- Consistent error response format across all endpoints
- Handle HCM being unreachable (timeouts, retries, graceful degradation)
- Handle invalid dimension combinations (employee+location not recognized by HCM)
- Handle insufficient balance when HCM doesn't catch it (local enforcement)
- Handle race conditions (concurrent requests for same balance)
- Input validation on all endpoints (Nest pipes/validators)

**Dependencies:** F5, F7, F8, F9, F10 (all business features)

---

## Parallelization Map

```
Phase 1 (sequential):    F1 — Domain Models
                           │
Phase 2 (parallel):       ├── F2 — Balance Management
                          ├── F3 — Audit Trail
                          ├── F4 — HCM Client Real-time
                          └── F6 — Request Read/List
                           │
Phase 3 (parallel):       ├── F5 — Request Create & Validate  (needs F2, F4)
                          └── F7 — Batch Balance Sync          (needs F2, F3, F4)
                           │
Phase 4:                  └── F8 — Manager Approval            (needs F5, F3)
                           │
Phase 5 (parallel):       ├── F9  — HCM Sync on Approval      (needs F8, F4)
                          └── F10 — Cancellation               (needs F8, F3, F4)
                           │
Phase 6 (sequential):    └── F11 — Error Hardening             (needs all)
```

**Max parallelism: 4 agents** (Phase 2: F2, F3, F4, F6 simultaneously)

---

## Out of Scope

- Employee/location CRUD (referenced by ID only)
- GraphQL (REST only per AGENTS.md)
- Authentication/authorization (not mentioned in take-home)
- Notifications/email
- UI/frontend
