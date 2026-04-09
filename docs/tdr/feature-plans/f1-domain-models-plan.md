# F1 — Domain Models & Prisma Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define all Prisma domain models (Balance, TimeOffRequest, BalanceAuditEntry), their enums, relations, and indexes in a single atomic migration — enabling all Phase 2 features to start immediately.

**Architecture:** Extend the existing Prisma schema with three models. Enum-like fields (`status`, `reason`) are stored as `String` because the SQLite Prisma connector does not support native `enum` types — application-layer validation will be added in downstream features. A single migration creates everything. No services, controllers, or business logic are introduced. Testing confirms the generated Prisma client exposes the expected delegates and that CRUD + FK constraints work end-to-end.

**Tech Stack:** Prisma, SQLite, Jest, Supertest, NestJS (existing harness only)

**Spec:** [`docs/tdr/specs/f1-domain-models-spec.md`](../specs/f1-domain-models-spec.md)

**Worktree:** `.worktrees/f1-domain-models` (branch `f1-domain-models`)

> **All commands and file paths below are relative to the worktree root:**
> `cd <repo-root>/.worktrees/f1-domain-models` before starting.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `docs/tdr/master.md` | Modify | Add F1 design decisions section + links to spec and plan |
| `docs/tdr/specs/f1-domain-models-spec.md` | Modify | Update enum strategy to reflect SQLite limitation |
| `prisma/schema.prisma` | Modify | Add 3 models with String-based enum fields, indexes, relations |
| `prisma/migrations/<ts>_add_domain_models/` | Generated | Single atomic migration |
| `src/prisma/prisma-models.spec.ts` | Create | Unit test asserting Prisma client model delegates exist |
| `test/integration/domain-models.integration-spec.ts` | Create | Integration test: CRUD, FK, unique constraint |
| `docs/tdr/feature-plans/f1-domain-models-plan.md` | Create | This file |

---

### Task 1: Update the Master TDR with F1 Design Decisions

**Files:**
- Modify: `docs/tdr/master.md`

This task documents all design decisions from the F1 brainstorming session in the
master TDR, and links the spec and plan.

- [ ] **Step 1: Add the F1 design decisions section and document links**

In `docs/tdr/master.md`, add a new `## F1 Design Decisions` section after the
existing `## Pending Product Definitions` section, and add the F1 document links
to the `## Active Documents` section.

Add to `## Active Documents` (after the existing base foundation entries):

```markdown
- F1 domain models spec: [f1-domain-models-spec.md](./specs/f1-domain-models-spec.md)
- F1 domain models plan: [f1-domain-models-plan.md](./feature-plans/f1-domain-models-plan.md)
```

Add the new section at the end of the file:

```markdown
## F1 Design Decisions

Resolved during F1 brainstorming. These are authoritative for all downstream features.

| Decision | Choice | Rationale |
|---|---|---|
| Balance fields | `availableDays` + `reservedDays` | Standard model supports F5 tentative reservation without workarounds |
| Time dimension on requests | `startDate` + `endDate` date range | Aligns with typical PTO workflows; day count derived as (end − start + 1) |
| Day granularity | Integer days only | Matches take-home scope; no half-day support needed |
| Request status model | PENDING, APPROVED, REJECTED, CANCELLED | Simple four-state; HCM sync outcomes handled via rollback, not extra states |
| Balance uniqueness | Composite unique on (employeeId, locationId) | One balance per dimension enforced at the DB level |
| Employee / location IDs | Opaque strings from HCM | No local entity tables; "referenced by ID only" per roadmap |
| Primary key strategy | UUID (`@default(uuid())`) | Consistent across all domain models |
| Enum strategy | Prisma `enum` types | Type-safe generated client code; self-documenting schema |
| Audit → related entity | Nullable FK to TimeOffRequest + free-text `reference` | Direct typed link for request changes; flexible for sync/manual |
| Migration approach | Single atomic migration for all models | Greenfield; maximizes Phase 2 parallelism |
```

- [ ] **Step 2: Commit**

```bash
git add docs/tdr/master.md
git commit -m "docs: record F1 design decisions and link spec/plan in master TDR

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Extend the Prisma Schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add models to the schema**

> **SQLite limitation:** The SQLite Prisma connector does not support `enum` types.
> Status and reason fields use `String` with documented default values. Application-
> layer validation will enforce allowed values in service code (F2, F3, F5).

Append the following after the existing `ServiceMetadata` model in
`prisma/schema.prisma`:

```prisma
model Balance {
  id             String   @id @default(uuid())
  employeeId     String
  locationId     String
  availableDays  Int      @default(0)
  reservedDays   Int      @default(0)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  auditEntries BalanceAuditEntry[]

  @@unique([employeeId, locationId])
  @@index([employeeId])
}

model TimeOffRequest {
  id          String   @id @default(uuid())
  employeeId  String
  locationId  String
  startDate   DateTime
  endDate     DateTime
  status      String   @default("PENDING")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  auditEntries BalanceAuditEntry[]

  @@index([employeeId, status])
}

model BalanceAuditEntry {
  id        String   @id @default(uuid())
  balanceId String
  requestId String?
  delta     Int
  reason    String
  reference String?
  actorId   String?
  createdAt DateTime @default(now())

  balance Balance         @relation(fields: [balanceId], references: [id])
  request TimeOffRequest? @relation(fields: [requestId], references: [id])

  @@index([balanceId, createdAt])
}
```

- [ ] **Step 2: Verify the schema is valid**

Run: `npx prisma validate`

Expected: `Your schema is valid.` or `The schema at ... is valid.`

- [ ] **Step 3: Commit the schema change**

```bash
git add prisma/schema.prisma
git commit -m "feat(prisma): add Balance, TimeOffRequest, BalanceAuditEntry models

Add three domain models with String-based enum fields (SQLite limitation),
indexes, unique constraints, and FK relations.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Generate the Migration and Prisma Client

**Files:**
- Generated: `prisma/migrations/<timestamp>_add_domain_models/migration.sql`

- [ ] **Step 1: Run the migration**

```bash
npx prisma migrate dev --name add_domain_models
```

Expected: Migration created and applied successfully. The Prisma client is
regenerated automatically.

- [ ] **Step 2: Verify the generated migration SQL**

Open the newly created `prisma/migrations/<timestamp>_add_domain_models/migration.sql`
and confirm it contains:

- `CREATE TABLE "Balance"` with `id`, `employeeId`, `locationId`, `availableDays`,
  `reservedDays`, `createdAt`, `updatedAt`
- `CREATE UNIQUE INDEX` on `Balance(employeeId, locationId)`
- `CREATE INDEX` on `Balance(employeeId)`
- `CREATE TABLE "TimeOffRequest"` with `id`, `employeeId`, `locationId`, `startDate`,
  `endDate`, `status` (default `'PENDING'`), `createdAt`, `updatedAt`
- `CREATE INDEX` on `TimeOffRequest(employeeId, status)`
- `CREATE TABLE "BalanceAuditEntry"` with `id`, `balanceId`, `requestId`, `delta`,
  `reason`, `reference`, `actorId`, `createdAt`
- `CREATE INDEX` on `BalanceAuditEntry(balanceId, createdAt)`
- Foreign key for `BalanceAuditEntry.balanceId` → `Balance.id`
- Foreign key for `BalanceAuditEntry.requestId` → `TimeOffRequest.id`

- [ ] **Step 3: Commit the migration**

```bash
git add prisma/migrations/
git commit -m "feat(prisma): add domain models migration

Single atomic migration creates Balance, TimeOffRequest, and
BalanceAuditEntry tables with all indexes and FK constraints.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Unit Test — Prisma Client Model Delegates

**Files:**
- Create: `src/prisma/prisma-models.spec.ts`

This test validates that the Prisma client type exposes the expected model
delegates. It does not connect to a database — it instantiates PrismaService
with a mock and asserts the delegates are defined.

- [ ] **Step 1: Write the failing test**

Create `src/prisma/prisma-models.spec.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

describe('Prisma domain model delegates', () => {
  it('exposes a balance model delegate', () => {
    const client = new PrismaClient();

    expect(client.balance).toBeDefined();
    expect(typeof client.balance.findMany).toBe('function');
    expect(typeof client.balance.create).toBe('function');
  });

  it('exposes a timeOffRequest model delegate', () => {
    const client = new PrismaClient();

    expect(client.timeOffRequest).toBeDefined();
    expect(typeof client.timeOffRequest.findMany).toBe('function');
    expect(typeof client.timeOffRequest.create).toBe('function');
  });

  it('exposes a balanceAuditEntry model delegate', () => {
    const client = new PrismaClient();

    expect(client.balanceAuditEntry).toBeDefined();
    expect(typeof client.balanceAuditEntry.findMany).toBe('function');
    expect(typeof client.balanceAuditEntry.create).toBe('function');
  });
});
```

- [ ] **Step 2: Run the test to verify it passes**

Since the Prisma client was already generated in Task 3, these tests should
pass immediately. This is a "schema smoke test" not a TDD red-green cycle —
the "implementation" was the schema change in Task 2.

Run: `npx jest src/prisma/prisma-models.spec.ts --verbose`

Expected: 3 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/prisma/prisma-models.spec.ts
git commit -m "test: add unit tests for Prisma domain model delegates

Smoke tests confirming the generated Prisma client exposes balance,
timeOffRequest, and balanceAuditEntry delegates with expected methods.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: Integration Test — CRUD and Constraint Verification

**Files:**
- Create: `test/integration/domain-models.integration-spec.ts`

This test uses the real Nest + Prisma + SQLite stack (same pattern as the
existing `health.integration-spec.ts`) to verify the migration, FK relations,
and unique constraint all work.

- [ ] **Step 1: Write the integration test**

Create `test/integration/domain-models.integration-spec.ts`:

```typescript
import { execSync } from 'node:child_process';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../../src/prisma/prisma.service';
import { startMockHcmServer } from '../support/mock-hcm-server';
import { setTestEnvironment } from '../support/test-env';

describe('Domain models integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cleanup: () => void;
  let closeMockHcm: () => Promise<void>;

  beforeAll(async () => {
    const mockHcmServer = await startMockHcmServer();
    const testEnvironment = setTestEnvironment({
      hcmBaseUrl: mockHcmServer.baseUrl,
    });

    cleanup = testEnvironment.cleanup;
    closeMockHcm = mockHcmServer.close;

    // Apply migrations to the fresh test SQLite database
    execSync('npx prisma migrate deploy', {
      env: process.env,
      stdio: 'pipe',
    });

    jest.resetModules();

    const { AppModule } = await import('../../src/app.module');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();

    await app.init();

    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
    await closeMockHcm();
    cleanup();
  });

  it('creates a Balance with the unique (employeeId, locationId) constraint', async () => {
    const balance = await prisma.balance.create({
      data: {
        employeeId: 'emp-1',
        locationId: 'loc-1',
        availableDays: 20,
        reservedDays: 0,
      },
    });

    expect(balance.id).toBeDefined();
    expect(balance.employeeId).toBe('emp-1');
    expect(balance.locationId).toBe('loc-1');
    expect(balance.availableDays).toBe(20);
    expect(balance.reservedDays).toBe(0);
  });

  it('rejects duplicate (employeeId, locationId) on Balance', async () => {
    await prisma.balance.create({
      data: {
        employeeId: 'emp-dup',
        locationId: 'loc-dup',
        availableDays: 10,
      },
    });

    await expect(
      prisma.balance.create({
        data: {
          employeeId: 'emp-dup',
          locationId: 'loc-dup',
          availableDays: 5,
        },
      }),
    ).rejects.toThrow();
  });

  it('creates a TimeOffRequest with default PENDING status', async () => {
    const request = await prisma.timeOffRequest.create({
      data: {
        employeeId: 'emp-1',
        locationId: 'loc-1',
        startDate: new Date('2026-05-01'),
        endDate: new Date('2026-05-03'),
      },
    });

    expect(request.id).toBeDefined();
    expect(request.status).toBe('PENDING');
  });

  it('creates a BalanceAuditEntry with FK relations to Balance and TimeOffRequest', async () => {
    const balance = await prisma.balance.create({
      data: {
        employeeId: 'emp-audit',
        locationId: 'loc-audit',
        availableDays: 15,
      },
    });

    const timeOffRequest = await prisma.timeOffRequest.create({
      data: {
        employeeId: 'emp-audit',
        locationId: 'loc-audit',
        startDate: new Date('2026-06-01'),
        endDate: new Date('2026-06-02'),
      },
    });

    const auditEntry = await prisma.balanceAuditEntry.create({
      data: {
        balanceId: balance.id,
        requestId: timeOffRequest.id,
        delta: -2,
        reason: 'RESERVATION',
        actorId: 'emp-audit',
      },
    });

    expect(auditEntry.id).toBeDefined();
    expect(auditEntry.balanceId).toBe(balance.id);
    expect(auditEntry.requestId).toBe(timeOffRequest.id);
    expect(auditEntry.delta).toBe(-2);
    expect(auditEntry.reason).toBe('RESERVATION');
  });

  it('creates a BalanceAuditEntry without a TimeOffRequest (nullable FK)', async () => {
    const balance = await prisma.balance.create({
      data: {
        employeeId: 'emp-sync',
        locationId: 'loc-sync',
        availableDays: 10,
      },
    });

    const auditEntry = await prisma.balanceAuditEntry.create({
      data: {
        balanceId: balance.id,
        delta: 5,
        reason: 'BATCH_SYNC',
        reference: 'sync-batch-001',
      },
    });

    expect(auditEntry.requestId).toBeNull();
    expect(auditEntry.reference).toBe('sync-batch-001');
  });

  it('queries audit entries by balance with chronological ordering', async () => {
    const balance = await prisma.balance.create({
      data: {
        employeeId: 'emp-chrono',
        locationId: 'loc-chrono',
        availableDays: 10,
      },
    });

    await prisma.balanceAuditEntry.create({
      data: {
        balanceId: balance.id,
        delta: -3,
        reason: 'RESERVATION',
      },
    });

    await prisma.balanceAuditEntry.create({
      data: {
        balanceId: balance.id,
        delta: 3,
        reason: 'RESERVATION_RELEASE',
      },
    });

    const entries = await prisma.balanceAuditEntry.findMany({
      where: { balanceId: balance.id },
      orderBy: { createdAt: 'asc' },
    });

    expect(entries).toHaveLength(2);
    expect(entries[0].reason).toBe('RESERVATION');
    expect(entries[1].reason).toBe('RESERVATION_RELEASE');
  });

  it('rejects a BalanceAuditEntry with an invalid balanceId FK', async () => {
    await expect(
      prisma.balanceAuditEntry.create({
        data: {
          balanceId: 'non-existent-balance-id',
          delta: 1,
          reason: 'MANUAL_ADJUSTMENT',
        },
      }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the integration test**

Run: `npm run test:integration`

Expected: All 7 tests pass. The existing `health.integration-spec.ts` also still passes.

- [ ] **Step 3: Commit**

```bash
git add test/integration/domain-models.integration-spec.ts
git commit -m "test: add integration tests for domain model CRUD and constraints

Verifies Balance unique constraint, TimeOffRequest default status,
BalanceAuditEntry FK relations (required + nullable), chronological
queries, and FK rejection for invalid references.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: Full Verification Pass

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

Expected: All tests pass with 100% coverage (the new spec file only imports
from `@prisma/client`, which is excluded from coverage collection).

- [ ] **Step 4: Run integration tests**

```bash
npm run test:integration
```

Expected: All integration tests pass (health + domain models).

- [ ] **Step 5: Run mutation testing**

```bash
npm run stryker
```

Expected: Stryker passes. No new mutation targets are needed for F1 since the
new code is purely schema definitions (no mutable application logic). The
existing `env.config.ts` target continues to pass.

- [ ] **Step 6: Final commit (if any fixes were needed)**

```bash
git add -A
git commit -m "chore: fix issues found during F1 verification pass

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

Only create this commit if Step 1–5 required code changes. If everything
passed cleanly, skip this step.
