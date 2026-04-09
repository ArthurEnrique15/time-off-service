# F4 — HCM Client Real-time Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing HcmClient with three real-time HCM API methods (`getBalance`, `submitTimeOff`, `cancelTimeOff`), introduce the shared `Either<Failure, Success>` type and `CustomHttpService` (ported from GCB repos), refactor the existing `checkConnection` for consistency, and extend the mock HCM server with stateful route handlers for testing.

**Architecture:** The HcmClient gains three new methods that communicate with the HCM's REST API. All methods return `Either<HcmError, T>` instead of throwing — callers pattern-match on the result. HTTP calls go through a new `CustomHttpService` (axios-based, never throws, normalizes errors to `AxiosResponse`). The mock HCM server gains stateful balance/request stores and route handlers that simulate realistic HCM behavior including error cases.

**Tech Stack:** NestJS 10, `@nestjs/axios` + `axios`, Prisma (existing), Jest + Supertest, SWC

**Spec:** `docs/tdr/specs/f4-hcm-client-spec.md` (created in Task 1)

**Worktree:** `.worktrees/f4-hcm-client` (branch `f4-hcm-client`)

> **All commands and file paths below are relative to the worktree root:**
> `cd <repo-root>/.worktrees/f4-hcm-client` before starting.

---

## F4 Design Decisions

These were resolved during brainstorming. Record in the master TDR (Task 2).

| Decision | Choice | Rationale |
|---|---|---|
| Error handling pattern | `Either<Failure, Success>` (GCB pattern) | Newer GCB repos (billing, invoice) use this consistently; explicit, composable, no try/catch needed by callers |
| HTTP layer | `CustomHttpService` wrapping `@nestjs/axios` | Matches GCB pattern; never throws; normalizes network errors to `AxiosResponse` |
| `checkConnection` refactor | Refactored to use `CustomHttpService` internally, keeps `boolean` return | Consistency within the client; health check callers are unaffected |
| HCM API contract | Self-defined REST contract (we control the mock) | Three endpoints: GET balance, POST time-off, DELETE time-off |
| HCM error codes | `INVALID_DIMENSIONS`, `INSUFFICIENT_BALANCE`, `NOT_FOUND`, `UNKNOWN` | Covers all HCM rejection cases from the take-home spec |
| Either type location | `src/shared/core/either/either.ts` | Follows GCB directory structure; reusable by all downstream features |
| CustomHttpService location | `src/shared/core/custom-http/` | Follows GCB directory structure; separate from HCM-specific code |
| HCM types location | `src/shared/providers/hcm/hcm.types.ts` | Co-located with client; DTOs are HCM-specific |
| Mock HCM server | Stateful with seedable balances/requests | Allows integration tests to configure scenarios (sufficient balance, insufficient, invalid dimensions) |

---

## HCM API Contract

These endpoints represent the external HCM system's REST API. The mock server implements them for testing.

### GET `/balances/:employeeId/:locationId`

| Status | Body | Meaning |
|---|---|---|
| 200 | `{ employeeId, locationId, availableDays }` | Balance found |
| 404 | `{ error: "INVALID_DIMENSIONS", message: "..." }` | Unknown employee+location combination |

### POST `/time-off-requests`

Request body: `{ employeeId, locationId, startDate, endDate }`

| Status | Body | Meaning |
|---|---|---|
| 201 | `{ id, status: "APPROVED" }` | Request accepted by HCM |
| 400 | `{ error: "INSUFFICIENT_BALANCE", message: "..." }` | Not enough days |
| 400 | `{ error: "INVALID_DIMENSIONS", message: "..." }` | Unknown employee+location |

### DELETE `/time-off-requests/:requestId`

| Status | Body | Meaning |
|---|---|---|
| 204 | (none) | Cancellation accepted |
| 404 | `{ error: "NOT_FOUND", message: "..." }` | Request ID not found in HCM |

### GET `/health` (existing, unchanged)

| Status | Body |
|---|---|
| 200 | `{ status: "ok" }` |

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `docs/tdr/specs/f4-hcm-client-spec.md` | Create | EARS feature specification |
| `docs/tdr/feature-plans/f4-hcm-client-plan.md` | Create | This plan (copy to repo) |
| `docs/tdr/master.md` | Modify | Add F4 design decisions + link spec/plan |
| `package.json` | Modify | Add `@nestjs/axios` + `axios` dependencies |
| `src/shared/core/either/either.ts` | Create | `Failure`, `Success`, `Either` types |
| `src/shared/core/either/index.ts` | Create | Barrel export |
| `src/shared/core/either/either.spec.ts` | Create | Unit tests for Either type |
| `src/shared/core/custom-http/custom-http.service.ts` | Create | Axios HTTP wrapper (never throws) |
| `src/shared/core/custom-http/custom-http.module.ts` | Create | NestJS module for CustomHttpService |
| `src/shared/core/custom-http/index.ts` | Create | Barrel export |
| `src/shared/core/custom-http/custom-http.service.spec.ts` | Create | Unit tests for CustomHttpService |
| `src/shared/providers/hcm/hcm.types.ts` | Create | HCM DTOs, error types, result types |
| `src/shared/providers/hcm/hcm.client.ts` | Modify | Refactor checkConnection + add 3 new methods |
| `src/shared/providers/hcm/hcm.module.ts` | Modify | Import CustomHttpModule |
| `src/shared/providers/hcm/hcm.client.spec.ts` | Modify | Rewrite tests for CustomHttpService-based client |
| `test/support/mock-hcm-server.ts` | Modify | Add stateful route handlers for 3 new endpoints |
| `test/integration/hcm-client.integration-spec.ts` | Create | Integration tests for HcmClient against mock server |

---

### Task 1: Write the EARS Feature Specification

**Files:**
- Create: `docs/tdr/specs/f4-hcm-client-spec.md`

- [ ] **Step 1: Create the specification file**

Create `docs/tdr/specs/f4-hcm-client-spec.md`:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add docs/tdr/specs/f4-hcm-client-spec.md
git commit -m "docs: add F4 HCM client real-time operations spec

EARS specification covering Either type, CustomHttpService,
HcmClient methods (getBalance, submitTimeOff, cancelTimeOff),
HCM API contract, mock server, and testing requirements.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Update the Master TDR with F4 Design Decisions

**Files:**
- Modify: `docs/tdr/master.md`

- [ ] **Step 1: Add F4 document links and design decisions**

In `docs/tdr/master.md`, add to the `## Active Documents` section (after the F1 entries):

```markdown
- F4 HCM client spec: [f4-hcm-client-spec.md](./specs/f4-hcm-client-spec.md)
- F4 HCM client plan: [f4-hcm-client-plan.md](./feature-plans/f4-hcm-client-plan.md)
```

Add a new `## F4 Design Decisions` section at the end of the file:

```markdown
## F4 Design Decisions

Resolved during F4 brainstorming. These are authoritative for all downstream features
that interact with the HCM or use shared infrastructure.

| Decision | Choice | Rationale |
|---|---|---|
| Error handling pattern | `Either<Failure, Success>` (GCB pattern) | Newer GCB repos (billing, invoice) use this consistently; explicit, composable, no try/catch needed by callers |
| HTTP layer | `CustomHttpService` wrapping `@nestjs/axios` | Matches GCB pattern; never throws; normalizes network errors to `AxiosResponse` |
| `checkConnection` refactor | Uses `CustomHttpService` internally, keeps `boolean` return | Consistency within the client; health check callers unaffected |
| HCM API contract | Self-defined REST contract (we control the mock) | GET balance, POST time-off, DELETE time-off |
| HCM error codes | `INVALID_DIMENSIONS`, `INSUFFICIENT_BALANCE`, `NOT_FOUND`, `UNKNOWN` | Covers all HCM rejection cases from the take-home spec |
| Either type location | `src/shared/core/either/` | Follows GCB directory structure; reusable by all downstream features |
| CustomHttpService location | `src/shared/core/custom-http/` | Follows GCB directory structure; separate from HCM-specific code |
| HCM types location | `src/shared/providers/hcm/hcm.types.ts` | Co-located with client; DTOs are HCM-specific |
| Mock HCM server | Stateful with seedable balances/requests | Allows integration tests to configure realistic scenarios |
```

- [ ] **Step 2: Commit**

```bash
git add docs/tdr/master.md
git commit -m "docs: record F4 design decisions and link spec/plan in master TDR

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Copy the Implementation Plan to the Repository

**Files:**
- Create: `docs/tdr/feature-plans/f4-hcm-client-plan.md`

- [ ] **Step 1: Copy this plan file into the repo**

Copy the contents of this plan into `docs/tdr/feature-plans/f4-hcm-client-plan.md`.

- [ ] **Step 2: Commit**

```bash
git add docs/tdr/feature-plans/f4-hcm-client-plan.md
git commit -m "docs: add F4 HCM client implementation plan

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Install Dependencies

**Files:**
- Modify: `package.json`
- Generated: `package-lock.json`

- [ ] **Step 1: Install `@nestjs/axios` and `axios`**

```bash
npm install @nestjs/axios@^3.1.3 axios
```

Expected: Both packages added to `dependencies` in `package.json`.

- [ ] **Step 2: Verify installation**

```bash
node -e "require('@nestjs/axios'); require('axios'); console.log('OK')"
```

Expected: Prints `OK`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @nestjs/axios and axios dependencies

Required for CustomHttpService (F4 HCM client real-time operations).

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: Implement the Either Type

**Files:**
- Create: `src/shared/core/either/either.ts`
- Create: `src/shared/core/either/index.ts`
- Create: `src/shared/core/either/either.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/shared/core/either/either.spec.ts`:

```typescript
import { Either, Failure, Success } from './either';

describe('Either', () => {
  describe('Failure', () => {
    it('creates a Failure with the given value', () => {
      const failure = Failure.create('something went wrong');

      expect(failure.value).toBe('something went wrong');
    });

    it('reports isFailure as true', () => {
      const failure = Failure.create('error');

      expect(failure.isFailure()).toBe(true);
    });

    it('reports isSuccess as false', () => {
      const failure = Failure.create('error');

      expect(failure.isSuccess()).toBe(false);
    });
  });

  describe('Success', () => {
    it('creates a Success with the given value', () => {
      const success = Success.create({ id: '123' });

      expect(success.value).toEqual({ id: '123' });
    });

    it('reports isFailure as false', () => {
      const success = Success.create('data');

      expect(success.isFailure()).toBe(false);
    });

    it('reports isSuccess as true', () => {
      const success = Success.create('data');

      expect(success.isSuccess()).toBe(true);
    });
  });

  describe('type narrowing', () => {
    it('narrows to Success when isSuccess returns true', () => {
      const result: Either<string, number> = Success.create(42);

      if (result.isSuccess()) {
        expect(result.value).toBe(42);
      } else {
        fail('Expected isSuccess to return true');
      }
    });

    it('narrows to Failure when isFailure returns true', () => {
      const result: Either<string, number> = Failure.create('bad');

      if (result.isFailure()) {
        expect(result.value).toBe('bad');
      } else {
        fail('Expected isFailure to return true');
      }
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/shared/core/either/either.spec.ts --verbose`

Expected: FAIL — cannot find module `./either`.

- [ ] **Step 3: Implement the Either type**

Create `src/shared/core/either/either.ts`:

```typescript
export class Failure<T> {
  readonly value: T;

  private constructor(value: T) {
    this.value = value;
  }

  isFailure(): this is Failure<T> {
    return true;
  }

  isSuccess(): this is Success<never> {
    return false;
  }

  static create<U>(value: U): Failure<U> {
    return new Failure(value);
  }
}

export class Success<T> {
  readonly value: T;

  private constructor(value: T) {
    this.value = value;
  }

  isFailure(): this is Failure<never> {
    return false;
  }

  isSuccess(): this is Success<T> {
    return true;
  }

  static create<U>(value: U): Success<U> {
    return new Success(value);
  }
}

export type Either<F, S> = Failure<F> | Success<S>;
```

Create `src/shared/core/either/index.ts`:

```typescript
export { Either, Failure, Success } from './either';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/shared/core/either/either.spec.ts --verbose`

Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/shared/core/either/
git commit -m "feat: add Either<Failure, Success> shared type

Ported from GCB pattern. Provides explicit, composable error handling
without exceptions. Used by HcmClient and downstream features.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: Implement CustomHttpService

**Files:**
- Create: `src/shared/core/custom-http/custom-http.service.ts`
- Create: `src/shared/core/custom-http/custom-http.module.ts`
- Create: `src/shared/core/custom-http/index.ts`
- Create: `src/shared/core/custom-http/custom-http.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/shared/core/custom-http/custom-http.service.spec.ts`:

```typescript
import type { HttpService } from '@nestjs/axios';
import type { AxiosRequestConfig, AxiosResponse } from 'axios';

import { CustomHttpService } from './custom-http.service';

describe('CustomHttpService', () => {
  const createService = () => {
    const mockAxiosRef = {
      request: jest.fn(),
    };

    const httpService = {
      axiosRef: mockAxiosRef,
    } as unknown as HttpService;

    const service = new CustomHttpService(httpService);

    return { service, mockAxiosRef };
  };

  it('returns the AxiosResponse when the request succeeds', async () => {
    const { service, mockAxiosRef } = createService();
    const expectedResponse: AxiosResponse = {
      status: 200,
      data: { result: 'ok' },
      statusText: 'OK',
      headers: {},
      config: {} as any,
    };

    mockAxiosRef.request.mockResolvedValue(expectedResponse);

    const config: AxiosRequestConfig = { method: 'GET', url: '/test' };
    const result = await service.request(config);

    expect(result).toBe(expectedResponse);
    expect(mockAxiosRef.request).toHaveBeenCalledWith(config);
  });

  it('returns the error response when the request fails with an HTTP error', async () => {
    const { service, mockAxiosRef } = createService();
    const errorResponse: AxiosResponse = {
      status: 404,
      data: { error: 'NOT_FOUND' },
      statusText: 'Not Found',
      headers: {},
      config: {} as any,
    };

    mockAxiosRef.request.mockRejectedValue({ response: errorResponse });

    const result = await service.request({ method: 'GET', url: '/missing' });

    expect(result).toBe(errorResponse);
  });

  it('returns a normalized 500 response when the request fails with a network error', async () => {
    const { service, mockAxiosRef } = createService();
    const networkError = new Error('ECONNREFUSED');

    mockAxiosRef.request.mockRejectedValue(networkError);

    const result = await service.request({ method: 'GET', url: '/unreachable' });

    expect(result.status).toBe(500);
    expect(result.data).toEqual({ error: networkError });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/shared/core/custom-http/custom-http.service.spec.ts --verbose`

Expected: FAIL — cannot find module `./custom-http.service`.

- [ ] **Step 3: Implement CustomHttpService**

Create `src/shared/core/custom-http/custom-http.service.ts`:

```typescript
import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import type { AxiosRequestConfig, AxiosResponse } from 'axios';

@Injectable()
export class CustomHttpService {
  private readonly logger = new Logger(CustomHttpService.name);

  constructor(private readonly httpService: HttpService) {}

  async request<T = any, D = any>(config: AxiosRequestConfig<D>): Promise<AxiosResponse<T>> {
    try {
      const response = await this.httpService.axiosRef.request<T, AxiosResponse<T>, D>(config);

      return response;
    } catch (error) {
      this.logger.error('Request error', {
        method: config.method,
        url: config.url,
        error,
      });

      if (error.response) {
        return error.response;
      }

      return { status: 500, data: { error } } as AxiosResponse;
    }
  }
}
```

Create `src/shared/core/custom-http/custom-http.module.ts`:

```typescript
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { CustomHttpService } from './custom-http.service';

@Module({
  imports: [HttpModule],
  providers: [CustomHttpService],
  exports: [CustomHttpService],
})
export class CustomHttpModule {}
```

Create `src/shared/core/custom-http/index.ts`:

```typescript
export { CustomHttpModule } from './custom-http.module';
export { CustomHttpService } from './custom-http.service';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/shared/core/custom-http/custom-http.service.spec.ts --verbose`

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/shared/core/custom-http/
git commit -m "feat: add CustomHttpService (axios wrapper, never throws)

Wraps @nestjs/axios HttpService. Returns AxiosResponse on success,
error.response on HTTP errors, and normalized { status: 500 } on
network errors. Matches GCB CustomHttpService pattern.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 7: Create HCM Types

**Files:**
- Create: `src/shared/providers/hcm/hcm.types.ts`

- [ ] **Step 1: Create the HCM types file**

Create `src/shared/providers/hcm/hcm.types.ts`:

```typescript
import type { Either } from '@shared/core/either';

export type HcmErrorCode = 'INVALID_DIMENSIONS' | 'INSUFFICIENT_BALANCE' | 'NOT_FOUND' | 'UNKNOWN';

export type HcmError = {
  code: HcmErrorCode;
  message: string;
  statusCode: number;
};

export type HcmBalanceResponse = {
  employeeId: string;
  locationId: string;
  availableDays: number;
};

export type HcmSubmitRequest = {
  employeeId: string;
  locationId: string;
  startDate: string;
  endDate: string;
};

export type HcmSubmitResponse = {
  id: string;
  status: string;
};

export type GetBalanceResult = Either<HcmError, HcmBalanceResponse>;
export type SubmitTimeOffResult = Either<HcmError, HcmSubmitResponse>;
export type CancelTimeOffResult = Either<HcmError, void>;
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/providers/hcm/hcm.types.ts
git commit -m "feat: add HCM API type definitions

DTOs for getBalance, submitTimeOff, cancelTimeOff with
Either-based result types and typed error codes.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 8: Refactor HcmClient and Add New Methods

**Files:**
- Modify: `src/shared/providers/hcm/hcm.client.ts`
- Modify: `src/shared/providers/hcm/hcm.module.ts`
- Modify: `src/shared/providers/hcm/hcm.client.spec.ts`

This is the core task. We rewrite the client to use `CustomHttpService` and add three
new methods. Because the existing `checkConnection` tests mock `global.fetch`, those
tests must also be rewritten to mock `CustomHttpService` instead.

- [ ] **Step 1: Write the failing tests for the refactored client**

Replace the contents of `src/shared/providers/hcm/hcm.client.spec.ts` with:

```typescript
import type { AxiosResponse } from 'axios';

import type { CustomHttpService } from '@shared/core/custom-http';
import type { EnvConfigService } from '@shared/config/env';

import { HcmClient } from './hcm.client';

describe('HcmClient', () => {
  const createClient = () => {
    const customHttpService = {
      request: jest.fn(),
    } as unknown as CustomHttpService;

    const envConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'hcm.apiBaseUrl') return 'http://127.0.0.1:4010';
        if (key === 'hcm.timeoutMs') return 1500;
        throw new Error(`Unexpected key: ${key}`);
      }),
    } as unknown as EnvConfigService;

    const client = new HcmClient(customHttpService, envConfigService);

    return { client, customHttpService, envConfigService };
  };

  const mockResponse = (overrides: Partial<AxiosResponse>): AxiosResponse =>
    ({ status: 200, data: {}, statusText: 'OK', headers: {}, config: {} as any, ...overrides });

  describe('checkConnection', () => {
    it('returns true when the health endpoint responds with status 200', async () => {
      const { client, customHttpService } = createClient();

      (customHttpService.request as jest.Mock).mockResolvedValue(
        mockResponse({ status: 200, data: { status: 'ok' } }),
      );

      await expect(client.checkConnection()).resolves.toBe(true);
      expect(customHttpService.request).toHaveBeenCalledWith({
        method: 'GET',
        url: 'http://127.0.0.1:4010/health',
        timeout: 1500,
      });
    });

    it('returns false when the health endpoint responds with a non-200 status', async () => {
      const { client, customHttpService } = createClient();

      (customHttpService.request as jest.Mock).mockResolvedValue(
        mockResponse({ status: 503 }),
      );

      await expect(client.checkConnection()).resolves.toBe(false);
    });

    it('returns false when the request results in a normalized network error', async () => {
      const { client, customHttpService } = createClient();

      (customHttpService.request as jest.Mock).mockResolvedValue(
        mockResponse({ status: 500, data: { error: new Error('ECONNREFUSED') } }),
      );

      await expect(client.checkConnection()).resolves.toBe(false);
    });
  });

  describe('getBalance', () => {
    it('returns Success with balance data when HCM responds with 200', async () => {
      const { client, customHttpService } = createClient();
      const balanceData = { employeeId: 'emp-1', locationId: 'loc-1', availableDays: 15 };

      (customHttpService.request as jest.Mock).mockResolvedValue(
        mockResponse({ status: 200, data: balanceData }),
      );

      const result = await client.getBalance('emp-1', 'loc-1');

      expect(result.isSuccess()).toBe(true);

      if (result.isSuccess()) {
        expect(result.value).toEqual(balanceData);
      }

      expect(customHttpService.request).toHaveBeenCalledWith({
        method: 'GET',
        url: 'http://127.0.0.1:4010/balances/emp-1/loc-1',
        timeout: 1500,
      });
    });

    it('returns Failure with INVALID_DIMENSIONS when HCM responds with 404', async () => {
      const { client, customHttpService } = createClient();

      (customHttpService.request as jest.Mock).mockResolvedValue(
        mockResponse({
          status: 404,
          data: { error: 'INVALID_DIMENSIONS', message: 'Unknown combination' },
        }),
      );

      const result = await client.getBalance('emp-x', 'loc-x');

      expect(result.isFailure()).toBe(true);

      if (result.isFailure()) {
        expect(result.value.code).toBe('INVALID_DIMENSIONS');
        expect(result.value.statusCode).toBe(404);
      }
    });

    it('returns Failure with UNKNOWN when HCM responds with an unexpected status', async () => {
      const { client, customHttpService } = createClient();

      (customHttpService.request as jest.Mock).mockResolvedValue(
        mockResponse({ status: 500, data: { error: new Error('timeout') } }),
      );

      const result = await client.getBalance('emp-1', 'loc-1');

      expect(result.isFailure()).toBe(true);

      if (result.isFailure()) {
        expect(result.value.code).toBe('UNKNOWN');
        expect(result.value.statusCode).toBe(500);
      }
    });
  });

  describe('submitTimeOff', () => {
    const submitRequest = {
      employeeId: 'emp-1',
      locationId: 'loc-1',
      startDate: '2026-05-01',
      endDate: '2026-05-03',
    };

    it('returns Success with submission data when HCM responds with 201', async () => {
      const { client, customHttpService } = createClient();
      const responseData = { id: 'hcm-req-1', status: 'APPROVED' };

      (customHttpService.request as jest.Mock).mockResolvedValue(
        mockResponse({ status: 201, data: responseData }),
      );

      const result = await client.submitTimeOff(submitRequest);

      expect(result.isSuccess()).toBe(true);

      if (result.isSuccess()) {
        expect(result.value).toEqual(responseData);
      }

      expect(customHttpService.request).toHaveBeenCalledWith({
        method: 'POST',
        url: 'http://127.0.0.1:4010/time-off-requests',
        timeout: 1500,
        data: submitRequest,
      });
    });

    it('returns Failure with INSUFFICIENT_BALANCE when HCM responds with 400 and that error', async () => {
      const { client, customHttpService } = createClient();

      (customHttpService.request as jest.Mock).mockResolvedValue(
        mockResponse({
          status: 400,
          data: { error: 'INSUFFICIENT_BALANCE', message: 'Not enough days' },
        }),
      );

      const result = await client.submitTimeOff(submitRequest);

      expect(result.isFailure()).toBe(true);

      if (result.isFailure()) {
        expect(result.value.code).toBe('INSUFFICIENT_BALANCE');
        expect(result.value.statusCode).toBe(400);
      }
    });

    it('returns Failure with INVALID_DIMENSIONS when HCM responds with 400 and that error', async () => {
      const { client, customHttpService } = createClient();

      (customHttpService.request as jest.Mock).mockResolvedValue(
        mockResponse({
          status: 400,
          data: { error: 'INVALID_DIMENSIONS', message: 'Unknown combination' },
        }),
      );

      const result = await client.submitTimeOff(submitRequest);

      expect(result.isFailure()).toBe(true);

      if (result.isFailure()) {
        expect(result.value.code).toBe('INVALID_DIMENSIONS');
      }
    });

    it('returns Failure with UNKNOWN when HCM responds with an unexpected status', async () => {
      const { client, customHttpService } = createClient();

      (customHttpService.request as jest.Mock).mockResolvedValue(
        mockResponse({ status: 500, data: {} }),
      );

      const result = await client.submitTimeOff(submitRequest);

      expect(result.isFailure()).toBe(true);

      if (result.isFailure()) {
        expect(result.value.code).toBe('UNKNOWN');
      }
    });
  });

  describe('cancelTimeOff', () => {
    it('returns Success with void when HCM responds with 204', async () => {
      const { client, customHttpService } = createClient();

      (customHttpService.request as jest.Mock).mockResolvedValue(
        mockResponse({ status: 204, data: null }),
      );

      const result = await client.cancelTimeOff('hcm-req-1');

      expect(result.isSuccess()).toBe(true);
      expect(customHttpService.request).toHaveBeenCalledWith({
        method: 'DELETE',
        url: 'http://127.0.0.1:4010/time-off-requests/hcm-req-1',
        timeout: 1500,
      });
    });

    it('returns Failure with NOT_FOUND when HCM responds with 404', async () => {
      const { client, customHttpService } = createClient();

      (customHttpService.request as jest.Mock).mockResolvedValue(
        mockResponse({
          status: 404,
          data: { error: 'NOT_FOUND', message: 'Request not found' },
        }),
      );

      const result = await client.cancelTimeOff('hcm-req-x');

      expect(result.isFailure()).toBe(true);

      if (result.isFailure()) {
        expect(result.value.code).toBe('NOT_FOUND');
        expect(result.value.statusCode).toBe(404);
      }
    });

    it('returns Failure with UNKNOWN when HCM responds with an unexpected status', async () => {
      const { client, customHttpService } = createClient();

      (customHttpService.request as jest.Mock).mockResolvedValue(
        mockResponse({ status: 500, data: {} }),
      );

      const result = await client.cancelTimeOff('hcm-req-1');

      expect(result.isFailure()).toBe(true);

      if (result.isFailure()) {
        expect(result.value.code).toBe('UNKNOWN');
      }
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/shared/providers/hcm/hcm.client.spec.ts --verbose`

Expected: FAIL — the constructor signature has changed (expects `CustomHttpService` as first arg).

- [ ] **Step 3: Update HcmModule to import CustomHttpModule**

Replace the contents of `src/shared/providers/hcm/hcm.module.ts` with:

```typescript
import { Module } from '@nestjs/common';

import { CustomHttpModule } from '@shared/core/custom-http';
import { EnvConfigModule } from '@shared/config/env';

import { HcmClient } from './hcm.client';

@Module({
  imports: [CustomHttpModule, EnvConfigModule],
  providers: [HcmClient],
  exports: [HcmClient],
})
export class HcmModule {}
```

- [ ] **Step 4: Implement the refactored HcmClient**

Replace the contents of `src/shared/providers/hcm/hcm.client.ts` with:

```typescript
import { Injectable } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';

import { Failure, Success } from '@shared/core/either';
import { CustomHttpService } from '@shared/core/custom-http';
import { EnvConfigService } from '@shared/config/env';

import type {
  CancelTimeOffResult,
  GetBalanceResult,
  HcmError,
  HcmErrorCode,
  HcmSubmitRequest,
  SubmitTimeOffResult,
} from './hcm.types';

@Injectable()
export class HcmClient {
  constructor(
    private readonly customHttpService: CustomHttpService,
    private readonly envConfigService: EnvConfigService,
  ) {}

  async checkConnection(): Promise<boolean> {
    const response = await this.customHttpService.request({
      method: 'GET',
      url: `${this.baseUrl}/health`,
      timeout: this.timeout,
    });

    return response.status === HttpStatus.OK;
  }

  async getBalance(employeeId: string, locationId: string): Promise<GetBalanceResult> {
    const response = await this.customHttpService.request({
      method: 'GET',
      url: `${this.baseUrl}/balances/${employeeId}/${locationId}`,
      timeout: this.timeout,
    });

    if (response.status === HttpStatus.OK) {
      return Success.create(response.data);
    }

    return Failure.create(this.toHcmError(response.status, response.data));
  }

  async submitTimeOff(request: HcmSubmitRequest): Promise<SubmitTimeOffResult> {
    const response = await this.customHttpService.request({
      method: 'POST',
      url: `${this.baseUrl}/time-off-requests`,
      timeout: this.timeout,
      data: request,
    });

    if (response.status === HttpStatus.CREATED) {
      return Success.create(response.data);
    }

    return Failure.create(this.toHcmError(response.status, response.data));
  }

  async cancelTimeOff(requestId: string): Promise<CancelTimeOffResult> {
    const response = await this.customHttpService.request({
      method: 'DELETE',
      url: `${this.baseUrl}/time-off-requests/${requestId}`,
      timeout: this.timeout,
    });

    if (response.status === HttpStatus.NO_CONTENT) {
      return Success.create(undefined);
    }

    return Failure.create(this.toHcmError(response.status, response.data));
  }

  private get baseUrl(): string {
    return this.envConfigService.get('hcm.apiBaseUrl');
  }

  private get timeout(): number {
    return this.envConfigService.get('hcm.timeoutMs');
  }

  private toHcmError(statusCode: number, data: any): HcmError {
    const knownCodes: HcmErrorCode[] = [
      'INVALID_DIMENSIONS',
      'INSUFFICIENT_BALANCE',
      'NOT_FOUND',
    ];

    const code: HcmErrorCode = knownCodes.includes(data?.error) ? data.error : 'UNKNOWN';
    const message: string = data?.message ?? `HCM responded with status ${statusCode}`;

    return { code, message, statusCode };
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest src/shared/providers/hcm/hcm.client.spec.ts --verbose`

Expected: All 13 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/shared/providers/hcm/
git commit -m "feat: extend HcmClient with getBalance, submitTimeOff, cancelTimeOff

Refactors checkConnection to use CustomHttpService. New methods return
Either<HcmError, T> for explicit error handling. Maps HCM error codes
(INVALID_DIMENSIONS, INSUFFICIENT_BALANCE, NOT_FOUND) to typed failures.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 9: Extend the Mock HCM Server

**Files:**
- Modify: `test/support/mock-hcm-server.ts`

- [ ] **Step 1: Rewrite the mock HCM server with stateful route handlers**

Replace the contents of `test/support/mock-hcm-server.ts` with:

```typescript
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

type MockBalance = {
  employeeId: string;
  locationId: string;
  availableDays: number;
};

type MockRequest = {
  id: string;
  employeeId: string;
  locationId: string;
  startDate: string;
  endDate: string;
};

type MockHcmServerOptions = {
  balances?: MockBalance[];
  requests?: MockRequest[];
};

const parseBody = async (request: IncomingMessage): Promise<any> => {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(chunk as Buffer);
  }

  const raw = Buffer.concat(chunks).toString();

  return raw ? JSON.parse(raw) : {};
};

const json = (response: ServerResponse, statusCode: number, body: any): void => {
  response.writeHead(statusCode, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
};

export const startMockHcmServer = async (options: MockHcmServerOptions = {}) => {
  const balanceStore = new Map<string, MockBalance>();
  const requestStore = new Map<string, MockRequest>();

  for (const balance of options.balances ?? []) {
    balanceStore.set(`${balance.employeeId}:${balance.locationId}`, balance);
  }

  for (const req of options.requests ?? []) {
    requestStore.set(req.id, req);
  }

  let requestCounter = 0;

  const server = createServer(async (request, response) => {
    const url = request.url ?? '';
    const method = request.method ?? '';

    // GET /health
    if (method === 'GET' && url === '/health') {
      json(response, 200, { status: 'ok' });

      return;
    }

    // GET /balances/:employeeId/:locationId
    const balanceMatch = url.match(/^\/balances\/([^/]+)\/([^/]+)$/);

    if (method === 'GET' && balanceMatch) {
      const [, employeeId, locationId] = balanceMatch;
      const key = `${employeeId}:${locationId}`;
      const balance = balanceStore.get(key);

      if (!balance) {
        json(response, 404, {
          error: 'INVALID_DIMENSIONS',
          message: `No balance found for employee ${employeeId} at location ${locationId}`,
        });

        return;
      }

      json(response, 200, {
        employeeId: balance.employeeId,
        locationId: balance.locationId,
        availableDays: balance.availableDays,
      });

      return;
    }

    // POST /time-off-requests
    if (method === 'POST' && url === '/time-off-requests') {
      const body = await parseBody(request);
      const key = `${body.employeeId}:${body.locationId}`;
      const balance = balanceStore.get(key);

      if (!balance) {
        json(response, 400, {
          error: 'INVALID_DIMENSIONS',
          message: `No balance found for employee ${body.employeeId} at location ${body.locationId}`,
        });

        return;
      }

      const startDate = new Date(body.startDate);
      const endDate = new Date(body.endDate);
      const daysRequested = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      if (balance.availableDays < daysRequested) {
        json(response, 400, {
          error: 'INSUFFICIENT_BALANCE',
          message: `Requested ${daysRequested} days but only ${balance.availableDays} available`,
        });

        return;
      }

      requestCounter++;
      const id = `hcm-req-${requestCounter}`;

      requestStore.set(id, {
        id,
        employeeId: body.employeeId,
        locationId: body.locationId,
        startDate: body.startDate,
        endDate: body.endDate,
      });

      balance.availableDays -= daysRequested;

      json(response, 201, { id, status: 'APPROVED' });

      return;
    }

    // DELETE /time-off-requests/:requestId
    const deleteMatch = url.match(/^\/time-off-requests\/([^/]+)$/);

    if (method === 'DELETE' && deleteMatch) {
      const [, requestId] = deleteMatch;
      const storedRequest = requestStore.get(requestId);

      if (!storedRequest) {
        json(response, 404, {
          error: 'NOT_FOUND',
          message: `Time-off request ${requestId} not found`,
        });

        return;
      }

      requestStore.delete(requestId);
      response.writeHead(204);
      response.end();

      return;
    }

    response.writeHead(404);
    response.end();
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Unable to determine mock HCM server address');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);

            return;
          }

          resolve();
        });
      });
    },
  };
};
```

- [ ] **Step 2: Run existing integration tests to verify backward compatibility**

Run: `npm run test:integration`

Expected: All existing tests pass. The `startMockHcmServer()` call with no arguments still works for the health and domain model tests.

- [ ] **Step 3: Commit**

```bash
git add test/support/mock-hcm-server.ts
git commit -m "feat: extend mock HCM server with stateful balance and request handlers

Adds GET /balances/:eid/:lid, POST /time-off-requests,
DELETE /time-off-requests/:rid with seedable state.
Existing /health handler and backward compatibility preserved.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 10: Write Integration Tests for HcmClient

**Files:**
- Create: `test/integration/hcm-client.integration-spec.ts`

- [ ] **Step 1: Write the integration test file**

Create `test/integration/hcm-client.integration-spec.ts`:

```typescript
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { startMockHcmServer } from '../support/mock-hcm-server';
import { setTestEnvironment } from '../support/test-env';

describe('HcmClient integration', () => {
  let app: INestApplication;
  let cleanup: () => void;
  let closeMockHcm: () => Promise<void>;
  let hcmClient: any;

  beforeAll(async () => {
    const mockHcmServer = await startMockHcmServer({
      balances: [
        { employeeId: 'emp-1', locationId: 'loc-1', availableDays: 20 },
        { employeeId: 'emp-2', locationId: 'loc-2', availableDays: 1 },
      ],
      requests: [
        { id: 'existing-req-1', employeeId: 'emp-1', locationId: 'loc-1', startDate: '2026-03-01', endDate: '2026-03-02' },
      ],
    });

    const testEnvironment = setTestEnvironment({
      hcmBaseUrl: mockHcmServer.baseUrl,
    });

    cleanup = testEnvironment.cleanup;
    closeMockHcm = mockHcmServer.close;

    jest.resetModules();

    const { AppModule } = await import('../../src/app.module');
    const { HcmClient } = await import('../../src/shared/providers/hcm/hcm.client');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    hcmClient = moduleRef.get(HcmClient);
  });

  afterAll(async () => {
    await app.close();
    await closeMockHcm();
    cleanup();
  });

  describe('checkConnection', () => {
    it('returns true when the mock HCM server is running', async () => {
      await expect(hcmClient.checkConnection()).resolves.toBe(true);
    });
  });

  describe('getBalance', () => {
    it('returns Success with balance data for a valid employee+location', async () => {
      const result = await hcmClient.getBalance('emp-1', 'loc-1');

      expect(result.isSuccess()).toBe(true);

      if (result.isSuccess()) {
        expect(result.value).toEqual({
          employeeId: 'emp-1',
          locationId: 'loc-1',
          availableDays: 20,
        });
      }
    });

    it('returns Failure with INVALID_DIMENSIONS for an unknown combination', async () => {
      const result = await hcmClient.getBalance('emp-unknown', 'loc-unknown');

      expect(result.isFailure()).toBe(true);

      if (result.isFailure()) {
        expect(result.value.code).toBe('INVALID_DIMENSIONS');
      }
    });
  });

  describe('submitTimeOff', () => {
    it('returns Success when the employee has sufficient balance', async () => {
      const result = await hcmClient.submitTimeOff({
        employeeId: 'emp-1',
        locationId: 'loc-1',
        startDate: '2026-06-01',
        endDate: '2026-06-02',
      });

      expect(result.isSuccess()).toBe(true);

      if (result.isSuccess()) {
        expect(result.value.id).toBeDefined();
        expect(result.value.status).toBe('APPROVED');
      }
    });

    it('returns Failure with INSUFFICIENT_BALANCE when days exceed available', async () => {
      const result = await hcmClient.submitTimeOff({
        employeeId: 'emp-2',
        locationId: 'loc-2',
        startDate: '2026-06-01',
        endDate: '2026-06-10',
      });

      expect(result.isFailure()).toBe(true);

      if (result.isFailure()) {
        expect(result.value.code).toBe('INSUFFICIENT_BALANCE');
      }
    });

    it('returns Failure with INVALID_DIMENSIONS for an unknown employee+location', async () => {
      const result = await hcmClient.submitTimeOff({
        employeeId: 'emp-unknown',
        locationId: 'loc-unknown',
        startDate: '2026-06-01',
        endDate: '2026-06-02',
      });

      expect(result.isFailure()).toBe(true);

      if (result.isFailure()) {
        expect(result.value.code).toBe('INVALID_DIMENSIONS');
      }
    });
  });

  describe('cancelTimeOff', () => {
    it('returns Success when cancelling an existing request', async () => {
      const result = await hcmClient.cancelTimeOff('existing-req-1');

      expect(result.isSuccess()).toBe(true);
    });

    it('returns Failure with NOT_FOUND for a non-existent request', async () => {
      const result = await hcmClient.cancelTimeOff('non-existent-req');

      expect(result.isFailure()).toBe(true);

      if (result.isFailure()) {
        expect(result.value.code).toBe('NOT_FOUND');
      }
    });
  });
});
```

- [ ] **Step 2: Run the integration tests**

Run: `npm run test:integration`

Expected: All integration tests pass (health, domain models, hcm-client).

- [ ] **Step 3: Commit**

```bash
git add test/integration/hcm-client.integration-spec.ts
git commit -m "test: add HcmClient integration tests against mock HCM server

End-to-end verification of checkConnection, getBalance, submitTimeOff,
and cancelTimeOff with seeded balances and requests.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 11: Full Verification Pass

**Files:**
- Modify: any files as needed to fix issues found

- [ ] **Step 1: Run the linter**

```bash
npm run lint
```

Expected: No errors.

- [ ] **Step 2: Run the type checker**

```bash
npm run typecheck
```

Expected: No errors.

- [ ] **Step 3: Run unit tests with coverage**

```bash
npm run test:cov
```

Expected: All tests pass with 100% coverage. New files included:
- `src/shared/core/either/either.ts`
- `src/shared/core/custom-http/custom-http.service.ts`
- `src/shared/providers/hcm/hcm.client.ts`
- `src/shared/providers/hcm/hcm.types.ts` (types only — no runtime logic to cover)

- [ ] **Step 4: Run integration tests**

```bash
npm run test:integration
```

Expected: All integration tests pass (health, domain models, hcm-client).

- [ ] **Step 5: Run mutation testing**

```bash
npm run stryker
```

Expected: Stryker passes with existing targets. Note: `stryker.config.mjs` may
need `src/shared/core/either/either.ts` and `src/shared/providers/hcm/hcm.client.ts`
added to the `mutate` array if those files contain mutable logic worth targeting.
If so, add them and re-run:

In `stryker.config.mjs`, update:
```javascript
mutate: [
  'src/shared/config/env/env.config.ts',
  'src/shared/core/either/either.ts',
  'src/shared/providers/hcm/hcm.client.ts',
],
```

Then re-run: `npm run stryker`

Expected: All mutants killed.

- [ ] **Step 6: Final commit (only if fixes were needed)**

```bash
git add -A
git commit -m "chore: fix issues found during F4 verification pass

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

Only create this commit if Steps 1–5 required code changes.
