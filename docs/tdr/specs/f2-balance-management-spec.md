# F2 — Balance Management Specification

## Context

The time-off service needs a Balance Management layer that provides REST read
endpoints for employee balances and internal service methods for mutating balances.
The internal methods are used programmatically by downstream features (F5, F7, F8,
F10) but are not exposed as REST write endpoints.

Balances are created externally — via HCM batch sync (F7) or database seeding.
F2 does not provide a creation endpoint.

This feature depends on F1 (Domain Models) which provides the `Balance` Prisma model
with `availableDays` and `reservedDays` fields and the composite unique constraint
on `(employeeId, locationId)`.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Internal method scope | All 5 mutation methods defined in F2 | Defines the balance contract for all downstream features |
| Insufficient balance | Service throws an error | Defensive — prevents invalid state at the domain layer |
| Balance not found (GET) | Return 404 | Standard REST; balances must exist from HCM sync |
| Balance not found (internal) | Service throws an error | Callers handle not-found; no silent failures |
| List pagination | None for now | Employee rarely has many locations; add later if needed |
| List empty result | Return empty array (200) | Standard REST — empty collection is not an error |
| employeeId query param | Required | Listing all balances globally is not a valid use case |

## EARS Requirements

### REST Endpoints

- When a client sends `GET /balances` with a valid `employeeId` query parameter,
  the system shall return a `200` response with a JSON array of all Balance records
  for that employee.

- When a client sends `GET /balances` without an `employeeId` query parameter,
  the system shall return a `400` response with an error message indicating the
  parameter is required.

- When a client sends `GET /balances` with an `employeeId` that has no balances,
  the system shall return a `200` response with an empty JSON array.

- When a client sends `GET /balances/:employeeId/:locationId` for an existing
  balance, the system shall return a `200` response with the Balance record as JSON.

- When a client sends `GET /balances/:employeeId/:locationId` for a balance that
  does not exist, the system shall return a `404` response.

### BalanceService — Read Methods

- When `findByEmployeeAndLocation(employeeId, locationId)` is called, the system
  shall query the database for a Balance matching the composite key and return the
  Balance record or `null` if not found.

- When `findAllByEmployee(employeeId)` is called, the system shall query the
  database for all Balance records with the given `employeeId` and return them as
  an array (empty if none exist).

### BalanceService — Internal Mutation Methods

- When `reserve(employeeId, locationId, days)` is called and the balance exists
  with `availableDays >= days`, the system shall atomically decrease `availableDays`
  by `days` and increase `reservedDays` by `days`, and return the updated Balance.

- When `reserve(employeeId, locationId, days)` is called and the balance does not
  exist, the system shall throw a `NotFoundException`.

- When `reserve(employeeId, locationId, days)` is called and `availableDays < days`,
  the system shall throw an error indicating insufficient balance without modifying
  the record.

- When `releaseReservation(employeeId, locationId, days)` is called and the balance
  exists with `reservedDays >= days`, the system shall atomically decrease
  `reservedDays` by `days` and increase `availableDays` by `days`, and return the
  updated Balance.

- When `releaseReservation(employeeId, locationId, days)` is called and the balance
  does not exist, the system shall throw a `NotFoundException`.

- When `releaseReservation(employeeId, locationId, days)` is called and
  `reservedDays < days`, the system shall throw an error indicating insufficient
  reserved days without modifying the record.

- When `confirmDeduction(employeeId, locationId, days)` is called and the balance
  exists with `reservedDays >= days`, the system shall decrease `reservedDays` by
  `days` (permanently deducting the balance) and return the updated Balance.

- When `confirmDeduction(employeeId, locationId, days)` is called and the balance
  does not exist, the system shall throw a `NotFoundException`.

- When `confirmDeduction(employeeId, locationId, days)` is called and
  `reservedDays < days`, the system shall throw an error indicating insufficient
  reserved days without modifying the record.

- When `restoreBalance(employeeId, locationId, days)` is called and the balance
  exists, the system shall increase `availableDays` by `days` and return the
  updated Balance.

- When `restoreBalance(employeeId, locationId, days)` is called and the balance
  does not exist, the system shall throw a `NotFoundException`.

- When `setAvailableDays(employeeId, locationId, newAvailable)` is called and the
  balance exists, the system shall overwrite `availableDays` to `newAvailable` and
  return the updated Balance.

- When `setAvailableDays(employeeId, locationId, newAvailable)` is called and the
  balance does not exist, the system shall throw a `NotFoundException`.

### Error Types

- The system shall use NestJS `NotFoundException` for balance-not-found errors.
- The system shall use a domain-specific `InsufficientBalanceError` (extending
  `BadRequestException`) for insufficient balance / insufficient reserved days errors.

### Testing

- The system shall include unit tests for every BalanceService method covering
  happy path, not-found, and insufficient-balance scenarios.
- The system shall include unit tests for BalanceController verifying delegation
  to BalanceService and correct HTTP status codes.
- The system shall include integration tests exercising the REST endpoints and
  internal service methods against a real SQLite database.

### Backward Compatibility

- Existing unit and integration tests shall continue to pass without modification.
- The `/health` endpoint shall remain functional.

## Out of Scope

- Balance creation endpoint (balances created via F7 batch sync or seeding)
- Audit trail logging (F3)
- HCM integration (F4)
- Pagination on the list endpoint
- Input validation beyond required `employeeId` query param (F11)
