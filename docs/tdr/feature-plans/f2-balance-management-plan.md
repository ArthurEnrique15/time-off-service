# F2 — Balance Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide REST read endpoints and internal service methods for employee balance management — enabling downstream features (F5, F7, F8, F10) to work with balances through a well-defined contract.

**Architecture:** A `BalanceService` in `src/core/services/` owns all balance reads and mutations. A `BalanceController` in `src/http/controllers/` exposes two read-only REST endpoints. Internal mutation methods are consumed programmatically by downstream features — not exposed as REST endpoints. Error handling uses NestJS `NotFoundException` for missing balances and a custom `InsufficientBalanceError` (extending `BadRequestException`) for insufficient balance conditions.

**Tech Stack:** NestJS, Prisma, SQLite, Jest, Supertest

**Spec:** [`docs/tdr/specs/f2-balance-management-spec.md`](../specs/f2-balance-management-spec.md)

**Worktree:** `.worktrees/f2-balance-management` (branch `f2-balance-management`)

> **All commands and file paths below are relative to the worktree root:**
> `cd <repo-root>/.worktrees/f2-balance-management` before starting.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `docs/tdr/master.md` | Modify | Add F2 design decisions section + links to spec and plan |
| `docs/tdr/specs/f2-balance-management-spec.md` | Create | EARS feature spec |
| `docs/tdr/feature-plans/f2-balance-management-plan.md` | Create | This file |
| `src/shared/errors/insufficient-balance.error.ts` | Create | Custom error class |
| `src/shared/errors/insufficient-balance.error.spec.ts` | Create | Unit test for error class |
| `src/core/services/balance.service.ts` | Create | BalanceService with reads + 5 mutation methods |
| `src/core/services/balance.service.spec.ts` | Create | Unit tests for all service methods |
| `src/http/controllers/balance.controller.ts` | Create | REST controller (2 GET endpoints) |
| `src/http/controllers/balance.controller.spec.ts` | Create | Controller unit tests |
| `src/module/providers.ts` | Modify | Register BalanceService |
| `src/module/controllers.ts` | Modify | Register BalanceController |
| `test/integration/balance.integration-spec.ts` | Create | Integration tests with real DB |
| `stryker.config.mjs` | Modify | Add balance.service.ts to mutate list |

---

### Task 1: Documentation — Spec, Plan, and TDR Update

**Files:**
- Create: `docs/tdr/specs/f2-balance-management-spec.md`
- Create: `docs/tdr/feature-plans/f2-balance-management-plan.md`
- Modify: `docs/tdr/master.md`

- [ ] **Step 1: Create the EARS feature spec**

Create `docs/tdr/specs/f2-balance-management-spec.md` per the spec template.

- [ ] **Step 2: Create this implementation plan**

Create `docs/tdr/feature-plans/f2-balance-management-plan.md` (this file).

- [ ] **Step 3: Update the master TDR**

In `docs/tdr/master.md`:

Add to `## Active Documents` section:
```markdown
- F2 balance management spec: [f2-balance-management-spec.md](./specs/f2-balance-management-spec.md)
- F2 balance management plan: [f2-balance-management-plan.md](./feature-plans/f2-balance-management-plan.md)
```

Add a new `## F2 Design Decisions` section after the existing `## F1 Design Decisions`:

```markdown
## F2 Design Decisions

Resolved during F2 planning. These are authoritative for all features consuming balance operations.

| Decision | Choice | Rationale |
|---|---|---|
| Internal method scope | All 5 mutation methods in F2 | Defines the balance contract for all downstream features |
| Insufficient balance handling | Service throws error | Defensive — prevents invalid state at domain layer |
| Balance not found (GET) | 404 response | Standard REST; balances must exist from HCM sync |
| Balance not found (internal) | Service throws NotFoundException | Callers handle not-found; no silent failures |
| List pagination | None for now | Employee rarely has many locations; add later if needed |
| List empty result | 200 with empty array | Standard REST — empty collection is not an error |
| employeeId query param | Required (400 if missing) | Listing all balances globally is not a valid use case |
| Error class for insufficient balance | InsufficientBalanceError extends BadRequestException | Domain-specific, maps to 400 HTTP status automatically |
```

- [ ] **Step 4: Commit**

```bash
git add docs/
git commit -m "docs: add F2 balance management spec, plan, and TDR update

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: TDD — InsufficientBalanceError

**Files:**
- Create: `src/shared/errors/insufficient-balance.error.ts`
- Create: `src/shared/errors/insufficient-balance.error.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/errors/insufficient-balance.error.spec.ts`:

```typescript
import { BadRequestException } from '@nestjs/common';

import { InsufficientBalanceError } from './insufficient-balance.error';

describe('InsufficientBalanceError', () => {
  it('extends BadRequestException', () => {
    const error = new InsufficientBalanceError('emp-1', 'loc-1', 5, 3);

    expect(error).toBeInstanceOf(BadRequestException);
  });

  it('includes employee, location, requested, and available in the message', () => {
    const error = new InsufficientBalanceError('emp-1', 'loc-1', 5, 3);

    expect(error.message).toContain('emp-1');
    expect(error.message).toContain('loc-1');
  });
});
```

- [ ] **Step 2: Write the implementation**

Create `src/shared/errors/insufficient-balance.error.ts`:

```typescript
import { BadRequestException } from '@nestjs/common';

export class InsufficientBalanceError extends BadRequestException {
  constructor(
    employeeId: string,
    locationId: string,
    requested: number,
    available: number,
  ) {
    super(
      `Insufficient balance for employee ${employeeId} at location ${locationId}: ` +
        `requested ${requested}, available ${available}`,
    );
  }
}
```

- [ ] **Step 3: Run the test**

```bash
npx jest src/shared/errors/insufficient-balance.error.spec.ts --verbose
```

Expected: 2 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/shared/errors/
git commit -m "feat: add InsufficientBalanceError for balance domain validation

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: TDD — BalanceService

**Files:**
- Create: `src/core/services/balance.service.spec.ts`
- Create: `src/core/services/balance.service.ts`

- [ ] **Step 1: Write failing unit tests**

Create `src/core/services/balance.service.spec.ts` with tests for:

1. `findByEmployeeAndLocation` — returns balance when found
2. `findByEmployeeAndLocation` — returns null when not found
3. `findAllByEmployee` — returns array of balances
4. `findAllByEmployee` — returns empty array when none
5. `reserve` — decreases available, increases reserved, returns updated
6. `reserve` — throws NotFoundException when balance not found
7. `reserve` — throws InsufficientBalanceError when available < days
8. `releaseReservation` — decreases reserved, increases available, returns updated
9. `releaseReservation` — throws NotFoundException when not found
10. `releaseReservation` — throws InsufficientBalanceError when reserved < days
11. `confirmDeduction` — decreases reserved, returns updated
12. `confirmDeduction` — throws NotFoundException when not found
13. `confirmDeduction` — throws InsufficientBalanceError when reserved < days
14. `restoreBalance` — increases available, returns updated
15. `restoreBalance` — throws NotFoundException when not found
16. `setAvailableDays` — overwrites available, returns updated
17. `setAvailableDays` — throws NotFoundException when not found

Mock PrismaService with `balance.findUnique`, `balance.findMany`, `balance.update`.

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest src/core/services/balance.service.spec.ts --verbose
```

Expected: Compilation/import failures (service doesn't exist yet).

- [ ] **Step 3: Implement BalanceService**

Create `src/core/services/balance.service.ts`:

- Injectable service with PrismaService dependency
- Read methods use `prisma.balance.findUnique` and `prisma.balance.findMany`
- Mutation methods use find-then-update pattern:
  1. Find balance by `(employeeId, locationId)` unique constraint
  2. If not found, throw `NotFoundException`
  3. Validate precondition (e.g., `availableDays >= days`)
  4. If validation fails, throw `InsufficientBalanceError`
  5. Update and return

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest src/core/services/balance.service.spec.ts --verbose
```

Expected: All 17 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/services/balance.service.ts src/core/services/balance.service.spec.ts
git commit -m "feat: add BalanceService with read and internal mutation methods

Seven methods: findByEmployeeAndLocation, findAllByEmployee, reserve,
releaseReservation, confirmDeduction, restoreBalance, setAvailableDays.
Throws NotFoundException for missing balances and InsufficientBalanceError
for insufficient balance conditions.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: TDD — BalanceController

**Files:**
- Create: `src/http/controllers/balance.controller.spec.ts`
- Create: `src/http/controllers/balance.controller.ts`

- [ ] **Step 1: Write failing unit tests**

Create `src/http/controllers/balance.controller.spec.ts` with tests for:

1. `GET /balances?employeeId=X` — delegates to `findAllByEmployee`, returns array
2. `GET /balances/:employeeId/:locationId` — delegates to `findByEmployeeAndLocation`, returns balance
3. `GET /balances/:employeeId/:locationId` — throws NotFoundException when service returns null

Mock BalanceService. Follow health.controller.spec.ts pattern.

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement BalanceController**

Create `src/http/controllers/balance.controller.ts`:

```typescript
@Controller('balances')
export class BalanceController {
  constructor(private readonly balanceService: BalanceService) {}

  @Get()
  findAll(@Query('employeeId') employeeId: string): Promise<Balance[]> {
    return this.balanceService.findAllByEmployee(employeeId);
  }

  @Get(':employeeId/:locationId')
  async findOne(
    @Param('employeeId') employeeId: string,
    @Param('locationId') locationId: string,
  ): Promise<Balance> {
    const balance = await this.balanceService.findByEmployeeAndLocation(employeeId, locationId);
    if (!balance) {
      throw new NotFoundException(
        `Balance not found for employee ${employeeId} at location ${locationId}`,
      );
    }
    return balance;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

```bash
git add src/http/controllers/balance.controller.ts src/http/controllers/balance.controller.spec.ts
git commit -m "feat: add BalanceController with GET /balances endpoints

Two read-only endpoints: list by employee and get by employee+location.
Returns 404 for missing balances.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: Register in Module

**Files:**
- Modify: `src/module/providers.ts`
- Modify: `src/module/controllers.ts`

- [ ] **Step 1: Add BalanceService to providers**

In `src/module/providers.ts`, add `BalanceService` import and to the array.

- [ ] **Step 2: Add BalanceController to controllers**

In `src/module/controllers.ts`, add `BalanceController` import and to the array.

- [ ] **Step 3: Run unit tests to verify module still compiles**

```bash
npm run test -- --silent
```

Expected: All existing + new unit tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/module/providers.ts src/module/controllers.ts
git commit -m "feat: register BalanceService and BalanceController in module

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: Integration Tests

**Files:**
- Create: `test/integration/balance.integration-spec.ts`

- [ ] **Step 1: Write integration tests**

Use the existing Nest + Prisma + SQLite + mock HCM pattern (same as domain-models.integration-spec.ts).

Test scenarios:
1. `GET /balances?employeeId=X` returns empty array when no balances
2. `GET /balances?employeeId=X` returns balances after seeding via Prisma
3. `GET /balances/:employeeId/:locationId` returns balance
4. `GET /balances/:employeeId/:locationId` returns 404 for missing balance
5. `BalanceService.reserve` reduces available, increases reserved
6. `BalanceService.reserve` throws on insufficient balance
7. `BalanceService.releaseReservation` reverses reservation
8. `BalanceService.confirmDeduction` permanently deducts reserved
9. `BalanceService.restoreBalance` increases available
10. `BalanceService.setAvailableDays` overwrites available

- [ ] **Step 2: Run integration tests**

```bash
npm run test:integration
```

Expected: All integration tests pass (health + domain-models + balance).

- [ ] **Step 3: Commit**

```bash
git add test/integration/balance.integration-spec.ts
git commit -m "test: add integration tests for balance endpoints and service methods

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 7: Stryker Update + Full Verification

**Files:**
- Modify: `stryker.config.mjs`

- [ ] **Step 1: Add balance.service.ts to Stryker mutate list**

In `stryker.config.mjs`, add `'src/core/services/balance.service.ts'` to the `mutate` array.

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

- [ ] **Step 4: Run unit tests with coverage**

```bash
npm run test:cov
```

Expected: 100% coverage.

- [ ] **Step 5: Run integration tests**

```bash
npm run test:integration
```

- [ ] **Step 6: Run mutation testing**

```bash
npm run stryker
```

- [ ] **Step 7: Commit if any fixes needed**

```bash
git add -A
git commit -m "chore: stryker update and verification fixes for F2

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```
