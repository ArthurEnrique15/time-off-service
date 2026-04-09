# F4 — HCM Client Real-time Operations Specification

## Context

The time-off service communicates with an external Human Capital Management (HCM) system
for balance queries, time-off submissions, and cancellations. The existing `HcmClient`
only has a `checkConnection()` method. This feature extends it with three real-time
operations and introduces shared infrastructure (`Either` type, `CustomHttpService`)
that downstream features will reuse.

Employees and locations are external entities managed by the HCM system and referenced
by opaque string IDs only.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Error handling pattern | `Either<Failure, Success>` (GCB pattern) | Newer GCB repos use this consistently; explicit, composable |
| HTTP layer | `CustomHttpService` wrapping `@nestjs/axios` | Matches GCB pattern; never throws; normalizes network errors |
| `checkConnection` refactor | Uses `CustomHttpService`, keeps `boolean` return | Consistency within the client; health check callers unaffected |
| HCM API contract | Self-defined REST (we control the mock) | Three endpoints: GET balance, POST time-off, DELETE time-off |
| HCM error codes | `INVALID_DIMENSIONS`, `INSUFFICIENT_BALANCE`, `NOT_FOUND`, `UNKNOWN` | Covers all HCM rejection cases |

## EARS Requirements

### Shared Infrastructure — Either Type

- The system shall provide a `Failure<T>` class with a readonly `value` property, an
  `isFailure()` method returning `true`, an `isSuccess()` method returning `false`,
  and a static `create<U>(value: U)` factory.
- The system shall provide a `Success<T>` class with a readonly `value` property, an
  `isFailure()` method returning `false`, an `isSuccess()` method returning `true`,
  and a static `create<U>(value: U)` factory.
- The system shall export a type `Either<F, S> = Failure<F> | Success<S>`.

### Shared Infrastructure — CustomHttpService

- The system shall provide a `CustomHttpService` injectable that accepts an
  `AxiosRequestConfig` and returns a `Promise<AxiosResponse<T>>`.
- When the upstream HTTP call succeeds, the service shall return the `AxiosResponse`
  unchanged.
- When the upstream HTTP call fails with an error response, the service shall return
  `error.response` (not throw).
- When the upstream HTTP call fails with a network error (no response), the service
  shall return `{ status: 500, data: { error } }` (not throw).
- The service shall log all request errors with the request config context.

### HCM API Contract

- GET `/balances/:employeeId/:locationId` shall return status `200` with
  `{ employeeId, locationId, availableDays }` for valid dimensions.
- GET `/balances/:employeeId/:locationId` shall return status `404` with
  `{ error: "INVALID_DIMENSIONS", message }` for unknown dimensions.
- POST `/time-off-requests` with body `{ employeeId, locationId, startDate, endDate }`
  shall return status `201` with `{ id, status: "APPROVED" }` when balance is sufficient.
- POST `/time-off-requests` shall return status `400` with
  `{ error: "INSUFFICIENT_BALANCE", message }` when balance is insufficient.
- POST `/time-off-requests` shall return status `400` with
  `{ error: "INVALID_DIMENSIONS", message }` for unknown dimensions.
- DELETE `/time-off-requests/:requestId` shall return status `204` (no body) for
  existing requests.
- DELETE `/time-off-requests/:requestId` shall return status `404` with
  `{ error: "NOT_FOUND", message }` for unknown request IDs.
- GET `/health` shall continue to return status `200` with `{ status: "ok" }`.

### HcmClient — checkConnection (refactored)

- When the HCM `/health` endpoint responds with status `200`, `checkConnection()` shall
  return `true`.
- When the HCM `/health` endpoint responds with a non-200 status, `checkConnection()`
  shall return `false`.
- When the HTTP call fails with a network error, `checkConnection()` shall return
  `false`.
- The method shall use `CustomHttpService` internally for HTTP communication.

### HcmClient — getBalance

- When the HCM returns status `200`, `getBalance(employeeId, locationId)` shall return
  `Success<HcmBalanceResponse>`.
- When the HCM returns status `404` with error `INVALID_DIMENSIONS`,
  `getBalance` shall return `Failure<HcmError>` with code `INVALID_DIMENSIONS`.
- When the HTTP call fails with a network error, `getBalance` shall return
  `Failure<HcmError>` with code `UNKNOWN`.

### HcmClient — submitTimeOff

- When the HCM returns status `201`, `submitTimeOff(request)` shall return
  `Success<HcmSubmitResponse>`.
- When the HCM returns status `400` with error `INSUFFICIENT_BALANCE`,
  `submitTimeOff` shall return `Failure<HcmError>` with code `INSUFFICIENT_BALANCE`.
- When the HCM returns status `400` with error `INVALID_DIMENSIONS`,
  `submitTimeOff` shall return `Failure<HcmError>` with code `INVALID_DIMENSIONS`.
- When the HTTP call fails with a network error, `submitTimeOff` shall return
  `Failure<HcmError>` with code `UNKNOWN`.

### HcmClient — cancelTimeOff

- When the HCM returns status `204`, `cancelTimeOff(requestId)` shall return
  `Success<void>`.
- When the HCM returns status `404` with error `NOT_FOUND`, `cancelTimeOff` shall
  return `Failure<HcmError>` with code `NOT_FOUND`.
- When the HTTP call fails with a network error, `cancelTimeOff` shall return
  `Failure<HcmError>` with code `UNKNOWN`.

### Mock HCM Server

- The mock server shall accept optional seed data (`balances` map, `requests` map)
  via `startMockHcmServer(options?)`.
- The mock server shall implement all four route handlers (health, getBalance,
  submitTimeOff, cancelTimeOff) matching the HCM API contract above.
- The mock server's POST `/time-off-requests` handler shall check seeded balances
  and enforce sufficient balance logic.

### Testing

- Unit tests shall cover `Either` type (Failure/Success creation, type guards).
- Unit tests shall cover `CustomHttpService` (success, error response, network error).
- Unit tests shall cover each `HcmClient` method for every success and error path
  by mocking `CustomHttpService.request()`.
- Integration tests shall cover each `HcmClient` method against the live mock HCM
  server with seeded data, verifying end-to-end success and error scenarios.
- All existing tests (health unit, health integration, domain models integration)
  shall continue to pass.

### Backward Compatibility

- `checkConnection()` shall continue to return `Promise<boolean>` (not `Either`).
- The `HealthService` and its tests shall not require modification.
- The mock HCM server's existing `/health` handler shall remain unchanged.

## Out of Scope

- Balance management service logic (F2)
- Audit trail service logic (F3)
- Time-off request creation/validation logic (F5)
- Batch sync (F7)
- Any REST endpoints exposed by this service
