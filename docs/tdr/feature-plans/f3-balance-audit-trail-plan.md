# F3 — Balance Audit Trail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the balance audit trail service and read endpoint — enabling downstream features to record balance changes and exposing paginated, filterable history via REST.

**Architecture:** A `BalanceAuditService` in `src/core/services` provides an internal `recordEntry` method (no REST write) and a `getHistory` method. A `BalanceAuditController` in `src/http/controllers` exposes `GET /balances/:employeeId/:locationId/history` with offset/limit pagination, descending sort, and optional reason filter. The service validates `reason` constants at the application layer and returns 404 when the balance does not exist.

**Tech Stack:** NestJS, Prisma, SQLite, Jest, Supertest

**Spec:** [`docs/tdr/specs/f3-balance-audit-trail-spec.md`](../specs/f3-balance-audit-trail-spec.md)

**Worktree:** `.worktrees/f3-balance-audit-trail` (branch `f3-balance-audit-trail`)

> **All commands and file paths below are relative to the worktree root:**
> `cd <repo-root>/.worktrees/f3-balance-audit-trail` before starting.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `docs/tdr/master.md` | Modify | Add F3 design decisions section + links to spec and plan |
| `docs/tdr/specs/f3-balance-audit-trail-spec.md` | Create | EARS feature spec |
| `docs/tdr/feature-plans/f3-balance-audit-trail-plan.md` | Create | This file |
| `src/core/services/balance-audit.service.ts` | Create | Service: `recordEntry`, `getHistory` |
| `src/core/services/balance-audit.service.spec.ts` | Create | Unit tests for service |
| `src/http/controllers/balance-audit.controller.ts` | Create | Controller: GET history endpoint |
| `src/http/controllers/balance-audit.controller.spec.ts` | Create | Unit tests for controller |
| `src/module/providers.ts` | Modify | Register `BalanceAuditService` |
| `src/module/controllers.ts` | Modify | Register `BalanceAuditController` |
| `test/integration/balance-audit.integration-spec.ts` | Create | Integration tests via Supertest |

---

### Task 1: Documentation — Spec, Plan, and Master TDR

**Files:**
- Create: `docs/tdr/specs/f3-balance-audit-trail-spec.md`
- Create: `docs/tdr/feature-plans/f3-balance-audit-trail-plan.md`
- Modify: `docs/tdr/master.md`

- [ ] **Step 1:** Create the EARS feature spec.
- [ ] **Step 2:** Create this implementation plan.
- [ ] **Step 3:** Add F3 links to `## Active Documents` in master.md.
- [ ] **Step 4:** Add `## F3 Design Decisions` section to master.md.
- [ ] **Step 5:** Commit.

```bash
git add docs/tdr/
git commit -m "docs: add F3 plan and link spec/plan in master TDR

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: BalanceAuditService — TDD

**Files:**
- Create: `src/core/services/balance-audit.service.ts`
- Create: `src/core/services/balance-audit.service.spec.ts`

The service exports audit reason constants and provides two methods:

- `recordEntry(input)` — validates reason, creates a `BalanceAuditEntry` via Prisma.
- `getHistory(employeeId, locationId, options?)` — looks up the balance (404 if missing), queries paginated entries sorted descending by `createdAt`, applies optional reason filter.

- [ ] **Step 1: Write failing unit tests**

Test cases:
1. `recordEntry` creates an audit entry via `prisma.balanceAuditEntry.create`
2. `recordEntry` rejects an invalid reason value
3. `getHistory` throws `NotFoundException` when balance not found
4. `getHistory` returns paginated entries sorted descending by `createdAt`
5. `getHistory` applies reason filter when provided
6. `getHistory` uses defaults (page=1, limit=20) when not specified
7. `getHistory` caps limit at 100

Follow existing mock style (see `health.service.spec.ts`): mock `PrismaService` methods, assert calls and return values.

- [ ] **Step 2: Verify tests fail for the right reason** (module not found)

- [ ] **Step 3: Implement `BalanceAuditService`**

```typescript
export const AUDIT_REASONS = [
  'RESERVATION', 'RESERVATION_RELEASE', 'APPROVAL_DEDUCTION',
  'CANCELLATION_RESTORE', 'BATCH_SYNC', 'MANUAL_ADJUSTMENT',
] as const;
export type AuditReason = (typeof AUDIT_REASONS)[number];

export type CreateAuditEntryInput = {
  balanceId: string;
  delta: number;
  reason: AuditReason;
  requestId?: string;
  reference?: string;
  actorId?: string;
};

export type PaginatedAuditHistory = {
  data: BalanceAuditEntry[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};
```

- [ ] **Step 4: Verify all unit tests pass**
- [ ] **Step 5: Commit**

```bash
git add src/core/services/balance-audit.service.ts src/core/services/balance-audit.service.spec.ts
git commit -m "feat: add BalanceAuditService with recordEntry and getHistory

Includes application-layer reason validation, offset/limit pagination,
descending sort, and 404 for missing balance. Unit tests cover all paths.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: BalanceAuditController — TDD

**Files:**
- Create: `src/http/controllers/balance-audit.controller.ts`
- Create: `src/http/controllers/balance-audit.controller.spec.ts`

The controller has a single route:

```
GET /balances/:employeeId/:locationId/history
  ?page=1&limit=20&reason=RESERVATION
```

- [ ] **Step 1: Write failing unit tests**

Test cases:
1. Delegates to `balanceAuditService.getHistory` with parsed params
2. Uses default page=1 and limit=20 when not provided
3. Passes reason filter through when provided
4. Returns the service response directly

Follow existing mock style (see `health.controller.spec.ts`).

- [ ] **Step 2: Verify tests fail for the right reason**
- [ ] **Step 3: Implement `BalanceAuditController`**
- [ ] **Step 4: Verify all unit tests pass**
- [ ] **Step 5: Commit**

```bash
git add src/http/controllers/balance-audit.controller.ts src/http/controllers/balance-audit.controller.spec.ts
git commit -m "feat: add BalanceAuditController with GET history endpoint

Parses page/limit/reason query params and delegates to BalanceAuditService.
Unit tests cover delegation, defaults, and filter passthrough.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Module Wiring

**Files:**
- Modify: `src/module/providers.ts`
- Modify: `src/module/controllers.ts`

- [ ] **Step 1:** Add `BalanceAuditService` to `timeOffModuleProviders` array.
- [ ] **Step 2:** Add `BalanceAuditController` to `timeOffModuleControllers` array.
- [ ] **Step 3:** Run unit tests to confirm no regressions.
- [ ] **Step 4:** Commit.

```bash
git add src/module/providers.ts src/module/controllers.ts
git commit -m "feat: register BalanceAuditService and BalanceAuditController in module

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: Integration Tests

**Files:**
- Create: `test/integration/balance-audit.integration-spec.ts`

Uses the existing integration pattern: mock HCM server, fresh SQLite, `prisma migrate deploy`, Supertest.

- [ ] **Step 1: Write integration tests**

Test cases:
1. Returns 404 when balance does not exist
2. Returns empty `data` array when balance exists but has no audit entries
3. Returns audit entries sorted descending by `createdAt`
4. Paginates correctly (page 1 vs page 2, total and totalPages)
5. Filters by reason query param
6. Returns 400 for invalid reason query param

- [ ] **Step 2: Run integration tests**

```bash
npm run test:integration
```

Expected: All integration tests pass (health + domain models + balance audit).

- [ ] **Step 3: Commit**

```bash
git add test/integration/balance-audit.integration-spec.ts
git commit -m "test: add integration tests for balance audit trail endpoint

Covers 404, empty history, descending sort, pagination, reason filter,
and invalid reason rejection via Supertest.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: Verification Pass

- [ ] **Step 1:** `npm run lint` — no errors
- [ ] **Step 2:** `npm run typecheck` — no errors
- [ ] **Step 3:** `npm run test:cov` — 100% coverage
- [ ] **Step 4:** `npm run test:integration` — all pass
- [ ] **Step 5:** `npm run stryker` — passes; add mutation targets for new service logic if applicable
- [ ] **Step 6:** Final commit if any fixes were needed
