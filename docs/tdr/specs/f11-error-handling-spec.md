# F11 · Error Handling & Defensive Validation Hardening

## Objective

Cross-cutting hardening pass to ensure no unhandled exception ever leaks a raw
stack trace, HCM calls cannot hang indefinitely, and the protection mechanisms
for concurrent requests are documented and tested.

## Scope

This feature only adds new behaviour in two areas and formally documents a third.
Everything else (input validation via DTOs + `ValidationPipe`, HCM error
mapping, local balance enforcement, in-transaction re-checks) was implemented
correctly in F2–F10 and is out of scope.

**In scope:**

| Area | Change |
|---|---|
| Global exception filter | New `AllExceptionsFilter` registered globally |
| HCM request timeout | New `HCM_TIMEOUT_MS` env var; passed on every HCM call |
| Race condition protection | TDR entry documenting existing SQLite serialisation |

**Out of scope:**

- Retry logic for transient HCM failures
- Row-level locking (SQLite has no `SELECT FOR UPDATE`)
- Custom error response shape (NestJS default `{ statusCode, message, error }` is kept)

---

## Requirements

### R1 · Global Exception Filter

#### R1.1

WHEN an unhandled exception that is not an `HttpException` is thrown during
request processing,  
THEN the service SHALL return `HTTP 500` with body
`{ "statusCode": 500, "message": "Internal server error" }`.

#### R1.2

WHEN an `HttpException` is thrown anywhere in the application,  
THEN the filter SHALL pass it through with its original status code and message
unchanged.

#### R1.3

WHEN any unhandled exception is caught by the filter,  
THEN the filter SHALL log the exception with `Logger.error` including the
request method, URL, and the exception message/stack.

#### R1.4

The filter SHALL be registered as a global filter via `app.useGlobalFilters` in
`bootstrap()` (not via `APP_FILTER` provider) so integration tests that bypass
`bootstrap` can configure it independently.

---

### R2 · HCM Request Timeout

#### R2.1

The environment schema SHALL declare an optional `HCM_TIMEOUT_MS` variable of
type `number` with a default value of `5000`.

#### R2.2

WHEN `HcmClient` makes any HTTP request to HCM (balance fetch, time-off submit,
time-off cancel, health check),  
THEN the request SHALL include the configured `HCM_TIMEOUT_MS` value as the
axios `timeout` option.

#### R2.3

WHEN the HCM request exceeds `HCM_TIMEOUT_MS` and axios emits a timeout error
(no `error.response`),  
THEN `CustomHttpService` SHALL return a synthetic `AxiosResponse` with
`status: 500` (existing behaviour).

#### R2.4

WHEN `HcmClient` receives a `status: 500` synthetic response (from a timeout or
network error),  
THEN it SHALL return `Left({ code: 'UNKNOWN', ... })` (existing behaviour).

#### R2.5

WHEN the service layer receives an `UNKNOWN` HCM error during approval or
cancellation,  
THEN it SHALL throw `ServiceUnavailableException` (existing behaviour).

*R2.3–R2.5 confirm the existing path still holds; only R2.1–R2.2 require code
changes.*

---

### R3 · Race Condition Protection (Documentation)

*No code change. Documented here as the authoritative statement.*

#### R3.1

WHEN two concurrent requests attempt to reserve days from the same balance
simultaneously,  
THEN the first transaction to commit SHALL succeed and the second SHALL receive
an `InsufficientBalanceError` from the in-transaction re-check inside
`reserveInTx`.

#### R3.2

SQLite's single-writer file lock ensures that the `balance.update` calls inside
separate Prisma transactions cannot interleave. The balance is re-read **inside**
every transaction that mutates it (`reserveInTx`, `releaseReservationInTx`,
`confirmDeductionInTx`, `restoreBalanceInTx`), so a stale pre-transaction read
cannot cause a double-spend.

---

## Implementation Notes

### AllExceptionsFilter

- Location: `src/http/filters/all-exceptions.filter.ts`
- Implements `ExceptionFilter`
- Injects `HttpAdapterHost` to extract the underlying platform response
- On non-`HttpException`: log + send 500
- On `HttpException`: delegate to default NestJS response (call
  `exception.getResponse()` / `exception.getStatus()` as normal)

### HcmClient timeout

- `EnvService` already exposes typed config values; add `HCM_TIMEOUT_MS` to
  `env.schema.ts` with `z.coerce.number().default(5000)`
- `HcmClient` is constructed with `EnvService` already injected (via
  `CustomHttpService` chain); inject `EnvService` directly into `HcmClient`
  and read `hcmTimeoutMs = envService.get('hcmTimeoutMs')`
- Pass `{ timeout: this.hcmTimeoutMs }` to every `customHttpService.request()`
  call inside `HcmClient`

### Testing

- `AllExceptionsFilter`: unit test covers non-`HttpException` path (500) and
  `HttpException` pass-through; integration test verifies a route that throws
  a plain `Error` returns 500 without leaking a stack trace
- `HcmClient` timeout: unit test stubs `customHttpService.request` to simulate
  a timeout (return `{ status: 500 }`) and asserts `Left({ code: 'UNKNOWN' })`
- Env schema: unit test for new `HCM_TIMEOUT_MS` default value

---

## Acceptance Criteria

1. A route that throws `new Error('boom')` returns `{ statusCode: 500, message: 'Internal server error' }` — no stack trace in the response body.
2. A route that throws `new NotFoundException('x')` still returns `{ statusCode: 404, message: 'x', error: 'Not Found' }`.
3. Starting the app without `HCM_TIMEOUT_MS` set uses 5000 ms as default.
4. `HcmClient` passes the configured timeout on every outbound call.
5. All 202 existing tests continue to pass; coverage remains 100 %.
