# F7 — HCM Batch Balance Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `POST /sync/batch` to receive a full corpus of HCM balance data, upsert local balances, detect PENDING request conflicts, and return a detailed outcome summary.

**Architecture:** A new `BatchSyncService` orchestrates per-entry upsert (via a new `BalanceService.upsertBalance`), audit trail recording, and conflict detection. A new `SyncController` exposes `POST /sync/batch` with class-validator DTO validation. The mock HCM server gains `GET /balances` (bulk export) for realistic integration tests.

**Tech Stack:** NestJS 10, Prisma/SQLite, class-validator, class-transformer, Jest + Supertest, SWC

**Spec:** `docs/tdr/specs/f7-hcm-batch-sync-spec.md`

**Worktree:** `.worktrees/f7-hcm-batch-sync` (branch `f7-hcm-batch-sync`)

> **All commands and file paths below are relative to the worktree root:**
> `cd <repo-root>/.worktrees/f7-hcm-batch-sync` before starting.

---

## Task 1: Configure ValidationPipe globally

`class-validator` and `class-transformer` are installed but `ValidationPipe` is not wired up. DTOs in later tasks require it for `@IsString`, `@Min`, etc. to be enforced.

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Add `ValidationPipe` to `bootstrap`**

Replace the contents of `src/main.ts` with:

```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';

import { EnvConfigService } from '@shared/config/env';

import { AppModule } from './app.module';

export async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const envConfigService = app.get(EnvConfigService);
  const port = envConfigService.get('port');

  await app.listen(port);

  return app;
}

export function runForModule(
  currentMain: NodeJS.Module | undefined = require.main,
  currentModule: NodeJS.Module = module,
): void {
  if (currentMain === currentModule) {
    void bootstrap();
  }
}

runForModule();
```

- [ ] **Step 2: Run all tests — confirm no regression**

```bash
npm run test:cov
```

Expected: 92 tests passing, 100% coverage.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat(f7): configure ValidationPipe globally for DTO validation

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: Add `upsertBalance` to `BalanceService`

`BatchSyncService` needs an atomic operation that creates a balance if it doesn't exist or updates `availableDays` if it does, and returns the previous value so the audit delta can be computed.

**Files:**
- Modify: `src/core/services/balance.service.ts`
- Modify: `src/core/services/balance.service.spec.ts`

- [ ] **Step 1: Add `create` to the mock and write the failing tests**

In `src/core/services/balance.service.spec.ts`:

1. Add `create: jest.fn()` to `mockPrismaService.balance`:

```typescript
const mockPrismaService = {
  balance: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),  // ADD THIS LINE
  },
  $transaction: jest.fn(),
};
```

2. Append the following `describe` block inside the outer `describe('BalanceService', ...)` block, after the `setAvailableDays` describe block:

```typescript
describe('upsertBalance', () => {
  it('creates a new balance when the pair does not exist, returning wasCreated true and previousAvailableDays 0', async () => {
    const createdBalance = { ...mockBalance, availableDays: 15 };
    mockPrismaService.balance.findUnique.mockResolvedValue(null);
    mockPrismaService.balance.create.mockResolvedValue(createdBalance);

    const result = await service.upsertBalance('emp-1', 'loc-1', 15);

    expect(result.wasCreated).toBe(true);
    expect(result.previousAvailableDays).toBe(0);
    expect(result.balance).toEqual(createdBalance);
    expect(mockPrismaService.balance.create).toHaveBeenCalledWith({
      data: { employeeId: 'emp-1', locationId: 'loc-1', availableDays: 15 },
    });
  });

  it('updates an existing balance when the pair exists, returning wasCreated false and the prior availableDays', async () => {
    const updatedBalance = { ...mockBalance, availableDays: 30 };
    mockPrismaService.balance.findUnique.mockResolvedValue(mockBalance); // existing: availableDays 20
    mockPrismaService.balance.update.mockResolvedValue(updatedBalance);

    const result = await service.upsertBalance('emp-1', 'loc-1', 30);

    expect(result.wasCreated).toBe(false);
    expect(result.previousAvailableDays).toBe(20);
    expect(result.balance).toEqual(updatedBalance);
    expect(mockPrismaService.balance.update).toHaveBeenCalledWith({
      where: { employeeId_locationId: { employeeId: 'emp-1', locationId: 'loc-1' } },
      data: { availableDays: 30 },
    });
  });
});
```

- [ ] **Step 2: Run the new tests — confirm they FAIL**

```bash
npm test -- --testPathPattern="balance.service.spec" --no-coverage
```

Expected: 2 tests fail with `TypeError: service.upsertBalance is not a function`.

- [ ] **Step 3: Add the `UpsertBalanceResult` type and `upsertBalance` method to `balance.service.ts`**

Add the exported type after the existing `TxClient` type (near the top of the file, after imports):

```typescript
export type UpsertBalanceResult = {
  balance: Balance;
  previousAvailableDays: number;
  wasCreated: boolean;
};
```

Add the `upsertBalance` method to the `BalanceService` class, before the `private` methods:

```typescript
async upsertBalance(employeeId: string, locationId: string, availableDays: number): Promise<UpsertBalanceResult> {
  return this.prismaService.$transaction(async (tx) => {
    const existing = await tx.balance.findUnique({
      where: { employeeId_locationId: { employeeId, locationId } },
    });

    if (existing) {
      const balance = await tx.balance.update({
        where: { employeeId_locationId: { employeeId, locationId } },
        data: { availableDays },
      });

      return { balance, previousAvailableDays: existing.availableDays, wasCreated: false };
    }

    const balance = await tx.balance.create({
      data: { employeeId, locationId, availableDays },
    });

    return { balance, previousAvailableDays: 0, wasCreated: true };
  });
}
```

- [ ] **Step 4: Run all tests — confirm passing**

```bash
npm run test:cov
```

Expected: all tests pass, 100% coverage.

- [ ] **Step 5: Commit**

```bash
git add src/core/services/balance.service.ts src/core/services/balance.service.spec.ts
git commit -m "feat(f7): add upsertBalance to BalanceService with TDD

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: Create batch sync DTOs

**Files:**
- Create: `src/http/dto/batch-sync.dto.ts`

- [ ] **Step 1: Create the DTO file**

```typescript
// src/http/dto/batch-sync.dto.ts
import { ArrayMinSize, IsArray, IsInt, IsNotEmpty, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class BatchBalanceEntryDto {
  @IsString()
  @IsNotEmpty()
  employeeId: string;

  @IsString()
  @IsNotEmpty()
  locationId: string;

  @IsInt()
  @Min(0)
  availableDays: number;
}

export class BatchSyncRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BatchBalanceEntryDto)
  balances: BatchBalanceEntryDto[];
}
```

- [ ] **Step 2: Run all tests — confirm no regression**

```bash
npm run test:cov
```

Expected: all tests pass, 100% coverage.

- [ ] **Step 3: Commit**

```bash
git add src/http/dto/batch-sync.dto.ts
git commit -m "feat(f7): add batch sync request DTOs

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: Create `BatchSyncService` (TDD)

**Files:**
- Create: `src/core/services/batch-sync.service.spec.ts`
- Create: `src/core/services/batch-sync.service.ts`

- [ ] **Step 1: Write the failing test file**

Create `src/core/services/batch-sync.service.spec.ts`:

```typescript
import type { PrismaService } from '@app-prisma/prisma.service';
import { BalanceAuditService } from '@core/services/balance-audit.service';
import { BalanceService } from '@core/services/balance.service';
import { BatchSyncService } from '@core/services/batch-sync.service';

describe('BatchSyncService', () => {
  const mockBalance = {
    id: 'balance-1',
    employeeId: 'emp-1',
    locationId: 'loc-1',
    availableDays: 10,
    reservedDays: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const createService = () => {
    const balanceService = {
      upsertBalance: jest.fn(),
    } as unknown as BalanceService;

    const auditService = {
      recordEntry: jest.fn(),
    } as unknown as BalanceAuditService;

    const prismaService = {
      timeOffRequest: {
        findMany: jest.fn(),
      },
    } as unknown as PrismaService;

    const service = new BatchSyncService(balanceService, auditService, prismaService);

    return { service, balanceService, auditService, prismaService };
  };

  describe('syncBatch', () => {
    it('creates a new balance, records a BATCH_SYNC audit entry, and returns created:1', async () => {
      const { service, balanceService, auditService, prismaService } = createService();
      (balanceService.upsertBalance as jest.Mock).mockResolvedValue({
        balance: { ...mockBalance, id: 'balance-new' },
        previousAvailableDays: 0,
        wasCreated: true,
      });
      (auditService.recordEntry as jest.Mock).mockResolvedValue({});
      (prismaService.timeOffRequest.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.syncBatch([{ employeeId: 'emp-1', locationId: 'loc-1', availableDays: 10 }]);

      expect(result.summary).toEqual({ created: 1, updated: 0, unchanged: 0, conflicted: 0, failed: 0 });
      expect(result.conflicts).toEqual([]);
      expect(result.errors).toEqual([]);
      expect(auditService.recordEntry).toHaveBeenCalledWith({
        balanceId: 'balance-new',
        delta: 10,
        reason: 'BATCH_SYNC',
        reference: 'HCM batch sync',
      });
    });

    it('skips an unchanged balance without recording an audit entry and returns unchanged:1', async () => {
      const { service, balanceService, auditService, prismaService } = createService();
      (balanceService.upsertBalance as jest.Mock).mockResolvedValue({
        balance: mockBalance,
        previousAvailableDays: 10,
        wasCreated: false,
      });

      const result = await service.syncBatch([{ employeeId: 'emp-1', locationId: 'loc-1', availableDays: 10 }]);

      expect(result.summary).toEqual({ created: 0, updated: 0, unchanged: 1, conflicted: 0, failed: 0 });
      expect(auditService.recordEntry).not.toHaveBeenCalled();
      expect(prismaService.timeOffRequest.findMany).not.toHaveBeenCalled();
    });

    it('updates a changed balance, records a BATCH_SYNC audit entry with correct delta, and returns updated:1', async () => {
      const { service, balanceService, auditService, prismaService } = createService();
      (balanceService.upsertBalance as jest.Mock).mockResolvedValue({
        balance: { ...mockBalance, availableDays: 25 },
        previousAvailableDays: 10,
        wasCreated: false,
      });
      (auditService.recordEntry as jest.Mock).mockResolvedValue({});
      (prismaService.timeOffRequest.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.syncBatch([{ employeeId: 'emp-1', locationId: 'loc-1', availableDays: 25 }]);

      expect(result.summary).toEqual({ created: 0, updated: 1, unchanged: 0, conflicted: 0, failed: 0 });
      expect(auditService.recordEntry).toHaveBeenCalledWith({
        balanceId: 'balance-1',
        delta: 15,
        reason: 'BATCH_SYNC',
        reference: 'HCM batch sync',
      });
    });

    it('flags a conflict when a PENDING request exists for the updated balance and returns conflicted:1', async () => {
      const { service, balanceService, auditService, prismaService } = createService();
      (balanceService.upsertBalance as jest.Mock).mockResolvedValue({
        balance: { ...mockBalance, availableDays: 5 },
        previousAvailableDays: 10,
        wasCreated: false,
      });
      (auditService.recordEntry as jest.Mock).mockResolvedValue({});
      (prismaService.timeOffRequest.findMany as jest.Mock).mockResolvedValue([{ id: 'req-1' }, { id: 'req-2' }]);

      const result = await service.syncBatch([{ employeeId: 'emp-1', locationId: 'loc-1', availableDays: 5 }]);

      expect(result.summary).toEqual({ created: 0, updated: 1, unchanged: 0, conflicted: 1, failed: 0 });
      expect(result.conflicts).toEqual([
        { employeeId: 'emp-1', locationId: 'loc-1', pendingRequestIds: ['req-1', 'req-2'] },
      ]);
      expect(prismaService.timeOffRequest.findMany).toHaveBeenCalledWith({
        where: { employeeId: 'emp-1', locationId: 'loc-1', status: 'PENDING' },
        select: { id: true },
      });
    });

    it('catches a processing error, adds it to errors, increments failed, and continues processing remaining entries', async () => {
      const { service, balanceService, auditService, prismaService } = createService();
      (balanceService.upsertBalance as jest.Mock)
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce({
          balance: { ...mockBalance, id: 'balance-2', employeeId: 'emp-2', locationId: 'loc-2' },
          previousAvailableDays: 0,
          wasCreated: true,
        });
      (auditService.recordEntry as jest.Mock).mockResolvedValue({});
      (prismaService.timeOffRequest.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.syncBatch([
        { employeeId: 'emp-1', locationId: 'loc-1', availableDays: 10 },
        { employeeId: 'emp-2', locationId: 'loc-2', availableDays: 5 },
      ]);

      expect(result.summary).toEqual({ created: 1, updated: 0, unchanged: 0, conflicted: 0, failed: 1 });
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({ employeeId: 'emp-1', locationId: 'loc-1', message: 'DB error' });
    });

    it('accumulates results across multiple entries correctly', async () => {
      const { service, balanceService, auditService, prismaService } = createService();
      (balanceService.upsertBalance as jest.Mock)
        .mockResolvedValueOnce({ balance: { ...mockBalance, id: 'b1' }, previousAvailableDays: 0, wasCreated: true })
        .mockResolvedValueOnce({ balance: { ...mockBalance, id: 'b2', availableDays: 5 }, previousAvailableDays: 5, wasCreated: false })
        .mockResolvedValueOnce({ balance: { ...mockBalance, id: 'b3', availableDays: 20 }, previousAvailableDays: 10, wasCreated: false });
      (auditService.recordEntry as jest.Mock).mockResolvedValue({});
      (prismaService.timeOffRequest.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.syncBatch([
        { employeeId: 'emp-1', locationId: 'loc-1', availableDays: 10 }, // new
        { employeeId: 'emp-2', locationId: 'loc-2', availableDays: 5 },  // unchanged
        { employeeId: 'emp-3', locationId: 'loc-3', availableDays: 20 }, // updated
      ]);

      expect(result.summary).toEqual({ created: 1, updated: 1, unchanged: 1, conflicted: 0, failed: 0 });
    });
  });
});
```

- [ ] **Step 2: Run — confirm the tests FAIL**

```bash
npm test -- --testPathPattern="batch-sync.service.spec" --no-coverage
```

Expected: fails with `Cannot find module '@core/services/batch-sync.service'`.

- [ ] **Step 3: Create `batch-sync.service.ts`**

```typescript
// src/core/services/batch-sync.service.ts
import { Injectable } from '@nestjs/common';

import { PrismaService } from '@app-prisma/prisma.service';
import { BalanceAuditService } from '@core/services/balance-audit.service';
import { BalanceService } from '@core/services/balance.service';

export type BatchSyncEntry = {
  employeeId: string;
  locationId: string;
  availableDays: number;
};

export type BatchSyncConflict = {
  employeeId: string;
  locationId: string;
  pendingRequestIds: string[];
};

export type BatchSyncError = {
  employeeId: string;
  locationId: string;
  message: string;
};

export type BatchSyncSummary = {
  created: number;
  updated: number;
  unchanged: number;
  conflicted: number;
  failed: number;
};

export type BatchSyncResult = {
  summary: BatchSyncSummary;
  conflicts: BatchSyncConflict[];
  errors: BatchSyncError[];
};

@Injectable()
export class BatchSyncService {
  constructor(
    private readonly balanceService: BalanceService,
    private readonly balanceAuditService: BalanceAuditService,
    private readonly prismaService: PrismaService,
  ) {}

  async syncBatch(entries: BatchSyncEntry[]): Promise<BatchSyncResult> {
    const summary: BatchSyncSummary = { created: 0, updated: 0, unchanged: 0, conflicted: 0, failed: 0 };
    const conflicts: BatchSyncConflict[] = [];
    const errors: BatchSyncError[] = [];

    for (const { employeeId, locationId, availableDays } of entries) {
      try {
        const { balance, previousAvailableDays, wasCreated } = await this.balanceService.upsertBalance(
          employeeId,
          locationId,
          availableDays,
        );

        if (!wasCreated && previousAvailableDays === availableDays) {
          summary.unchanged++;
          continue;
        }

        const delta = availableDays - previousAvailableDays;

        await this.balanceAuditService.recordEntry({
          balanceId: balance.id,
          delta,
          reason: 'BATCH_SYNC',
          reference: 'HCM batch sync',
        });

        const pendingRequests = await this.prismaService.timeOffRequest.findMany({
          where: { employeeId, locationId, status: 'PENDING' },
          select: { id: true },
        });

        if (wasCreated) {
          summary.created++;
        } else {
          summary.updated++;
        }

        if (pendingRequests.length > 0) {
          summary.conflicted++;
          conflicts.push({ employeeId, locationId, pendingRequestIds: pendingRequests.map((r) => r.id) });
        }
      } catch (error) {
        summary.failed++;
        errors.push({
          employeeId,
          locationId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { summary, conflicts, errors };
  }
}
```

- [ ] **Step 4: Run all tests — confirm passing**

```bash
npm run test:cov
```

Expected: all tests pass, 100% coverage.

- [ ] **Step 5: Commit**

```bash
git add src/core/services/batch-sync.service.ts src/core/services/batch-sync.service.spec.ts
git commit -m "feat(f7): add BatchSyncService with TDD

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5: Create `SyncController` (TDD)

**Files:**
- Create: `src/http/controllers/sync.controller.spec.ts`
- Create: `src/http/controllers/sync.controller.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/http/controllers/sync.controller.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';

import { BatchSyncService } from '@core/services/batch-sync.service';
import { SyncController } from '@http/controllers/sync.controller';

describe('SyncController', () => {
  let controller: SyncController;

  const mockResult = {
    summary: { created: 1, updated: 0, unchanged: 0, conflicted: 0, failed: 0 },
    conflicts: [],
    errors: [],
  };

  const mockBatchSyncService = {
    syncBatch: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SyncController],
      providers: [{ provide: BatchSyncService, useValue: mockBatchSyncService }],
    }).compile();

    controller = module.get<SyncController>(SyncController);
  });

  describe('syncBatch', () => {
    it('delegates to batchSyncService.syncBatch with the dto balances and returns the result', async () => {
      mockBatchSyncService.syncBatch.mockResolvedValue(mockResult);

      const dto = { balances: [{ employeeId: 'emp-1', locationId: 'loc-1', availableDays: 10 }] };
      const result = await controller.syncBatch(dto as any);

      expect(result).toEqual(mockResult);
      expect(mockBatchSyncService.syncBatch).toHaveBeenCalledWith(dto.balances);
    });
  });
});
```

- [ ] **Step 2: Run — confirm it FAILS**

```bash
npm test -- --testPathPattern="sync.controller.spec" --no-coverage
```

Expected: fails with `Cannot find module '@http/controllers/sync.controller'`.

- [ ] **Step 3: Create `sync.controller.ts`**

```typescript
// src/http/controllers/sync.controller.ts
import { Body, Controller, HttpCode, Post } from '@nestjs/common';

import { BatchSyncService, type BatchSyncResult } from '@core/services/batch-sync.service';
import { BatchSyncRequestDto } from '@http/dto/batch-sync.dto';

@Controller('sync')
export class SyncController {
  constructor(private readonly batchSyncService: BatchSyncService) {}

  @Post('batch')
  @HttpCode(200)
  syncBatch(@Body() dto: BatchSyncRequestDto): Promise<BatchSyncResult> {
    return this.batchSyncService.syncBatch(dto.balances);
  }
}
```

- [ ] **Step 4: Run all tests — confirm passing**

```bash
npm run test:cov
```

Expected: all tests pass, 100% coverage.

- [ ] **Step 5: Commit**

```bash
git add src/http/controllers/sync.controller.ts src/http/controllers/sync.controller.spec.ts
git commit -m "feat(f7): add SyncController with TDD

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6: Register `BatchSyncService` and `SyncController` in the module

**Files:**
- Modify: `src/module/providers.ts`
- Modify: `src/module/controllers.ts`

- [ ] **Step 1: Add `BatchSyncService` to providers**

Replace `src/module/providers.ts`:

```typescript
import { BalanceAuditService } from '@core/services/balance-audit.service';
import { BalanceService } from '@core/services/balance.service';
import { BatchSyncService } from '@core/services/batch-sync.service';
import { HealthService } from '@core/services/health.service';

export const timeOffModuleProviders = [BalanceService, HealthService, BalanceAuditService, BatchSyncService];
```

- [ ] **Step 2: Add `SyncController` to controllers**

Replace `src/module/controllers.ts`:

```typescript
import { BalanceAuditController } from '@http/controllers/balance-audit.controller';
import { BalanceController } from '@http/controllers/balance.controller';
import { HealthController } from '@http/controllers/health.controller';
import { SyncController } from '@http/controllers/sync.controller';

export const timeOffModuleControllers = [BalanceController, HealthController, BalanceAuditController, SyncController];
```

- [ ] **Step 3: Run all tests — confirm passing**

```bash
npm run test:cov
```

Expected: all tests pass, 100% coverage.

- [ ] **Step 4: Commit**

```bash
git add src/module/providers.ts src/module/controllers.ts
git commit -m "feat(f7): register BatchSyncService and SyncController in module

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 7: Add `GET /balances` bulk export to mock HCM server

**Files:**
- Modify: `test/support/mock-hcm-server.ts`

- [ ] **Step 1: Add the bulk handler**

In `test/support/mock-hcm-server.ts`, inside the `createServer` callback, add the following block **immediately before** the `// GET /balances/:employeeId/:locationId` comment:

```typescript
// GET /balances  (bulk export — all seeded balances)
if (method === 'GET' && url === '/balances') {
  json(response, 200, { balances: Array.from(balanceStore.values()) });

  return;
}
```

Ordering is critical: the exact `/balances` string check must appear before the regex `balanceMatch` that captures `:employeeId/:locationId`, or the regex will match `/balances` as well (with empty captures).

After insertion the handler order in the file is:
1. `GET /health`
2. `GET /balances` (bulk — new)
3. `GET /balances/:employeeId/:locationId` (single)
4. `POST /time-off-requests`
5. `DELETE /time-off-requests/:requestId`

- [ ] **Step 2: Run all tests — confirm no regression**

```bash
npm run test:cov
```

Expected: all tests pass, 100% coverage.

- [ ] **Step 3: Commit**

```bash
git add test/support/mock-hcm-server.ts
git commit -m "feat(f7): add GET /balances bulk export to mock HCM server

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 8: Write integration tests

**Files:**
- Create: `test/integration/batch-sync.integration-spec.ts`

- [ ] **Step 1: Create the integration test file**

```typescript
// test/integration/batch-sync.integration-spec.ts
import type { INestApplication } from '@nestjs/common';
import { execSync } from 'node:child_process';
import request from 'supertest';

import type { PrismaService } from '../../src/prisma/prisma.service';
import { startMockHcmServer } from '../support/mock-hcm-server';
import { setTestEnvironment } from '../support/test-env';

describe('Batch balance sync integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cleanup: () => void;
  let closeMockHcm: () => Promise<void>;

  beforeAll(async () => {
    const mockHcmServer = await startMockHcmServer({
      balances: [
        { employeeId: 'emp-a', locationId: 'loc-1', availableDays: 15 },
        { employeeId: 'emp-b', locationId: 'loc-1', availableDays: 10 },
        { employeeId: 'emp-c', locationId: 'loc-1', availableDays: 20 },
      ],
    });

    const testEnvironment = setTestEnvironment({ hcmBaseUrl: mockHcmServer.baseUrl });
    cleanup = testEnvironment.cleanup;
    closeMockHcm = mockHcmServer.close;

    execSync('npx prisma migrate deploy', { env: process.env, stdio: 'pipe' });

    jest.resetModules();

    const { AppModule } = await import('../../src/app.module');
    const { PrismaService: PrismaServiceClass } = await import('../../src/prisma/prisma.service');
    const { Test } = await import('@nestjs/testing');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaServiceClass);
  });

  afterEach(async () => {
    await prisma.balanceAuditEntry.deleteMany({});
    await prisma.timeOffRequest.deleteMany({});
    await prisma.balance.deleteMany({});
  });

  afterAll(async () => {
    await app.close();
    await closeMockHcm();
    cleanup();
  });

  describe('POST /sync/batch', () => {
    it('creates new balances for all entries and returns created:3', async () => {
      const payload = {
        balances: [
          { employeeId: 'emp-a', locationId: 'loc-1', availableDays: 15 },
          { employeeId: 'emp-b', locationId: 'loc-1', availableDays: 10 },
          { employeeId: 'emp-c', locationId: 'loc-1', availableDays: 20 },
        ],
      };

      const response = await request(app.getHttpServer()).post('/sync/batch').send(payload).expect(200);

      expect(response.body.summary).toEqual({ created: 3, updated: 0, unchanged: 0, conflicted: 0, failed: 0 });
      expect(response.body.conflicts).toEqual([]);
      expect(response.body.errors).toEqual([]);

      const balances = await prisma.balance.findMany({ orderBy: { employeeId: 'asc' } });
      expect(balances).toHaveLength(3);
      expect(balances[0].availableDays).toBe(15);
    });

    it('returns unchanged:2 when the same payload is posted a second time', async () => {
      const payload = {
        balances: [
          { employeeId: 'emp-a', locationId: 'loc-1', availableDays: 15 },
          { employeeId: 'emp-b', locationId: 'loc-1', availableDays: 10 },
        ],
      };

      await request(app.getHttpServer()).post('/sync/batch').send(payload).expect(200);
      const response = await request(app.getHttpServer()).post('/sync/batch').send(payload).expect(200);

      expect(response.body.summary).toEqual({ created: 0, updated: 0, unchanged: 2, conflicted: 0, failed: 0 });
    });

    it('updates existing balances and records audit entries verifiable via the history endpoint', async () => {
      await request(app.getHttpServer())
        .post('/sync/batch')
        .send({ balances: [{ employeeId: 'emp-a', locationId: 'loc-1', availableDays: 15 }] })
        .expect(200);

      const response = await request(app.getHttpServer())
        .post('/sync/batch')
        .send({ balances: [{ employeeId: 'emp-a', locationId: 'loc-1', availableDays: 25 }] })
        .expect(200);

      expect(response.body.summary).toEqual({ created: 0, updated: 1, unchanged: 0, conflicted: 0, failed: 0 });

      const history = await request(app.getHttpServer()).get('/balances/emp-a/loc-1/history').expect(200);

      const updateEntry = history.body.data.find((e: any) => e.reason === 'BATCH_SYNC' && e.delta === 10);
      expect(updateEntry).toBeDefined();
    });

    it('flags a conflict when a PENDING request exists and still applies the balance update', async () => {
      const balance = await prisma.balance.create({
        data: { employeeId: 'emp-conflict', locationId: 'loc-1', availableDays: 20 },
      });

      await prisma.timeOffRequest.create({
        data: {
          id: 'req-pending-1',
          employeeId: 'emp-conflict',
          locationId: 'loc-1',
          startDate: new Date('2026-06-01'),
          endDate: new Date('2026-06-05'),
          status: 'PENDING',
        },
      });

      const response = await request(app.getHttpServer())
        .post('/sync/batch')
        .send({ balances: [{ employeeId: 'emp-conflict', locationId: 'loc-1', availableDays: 5 }] })
        .expect(200);

      expect(response.body.summary.conflicted).toBe(1);
      expect(response.body.conflicts[0].pendingRequestIds).toContain('req-pending-1');

      const updated = await prisma.balance.findUnique({ where: { id: balance.id } });
      expect(updated!.availableDays).toBe(5);
    });

    it('handles a mixed payload of new, unchanged, updated, and conflicted entries', async () => {
      await prisma.balance.create({ data: { employeeId: 'emp-x', locationId: 'loc-1', availableDays: 10 } });
      await prisma.balance.create({ data: { employeeId: 'emp-y', locationId: 'loc-1', availableDays: 8 } });
      await prisma.balance.create({ data: { employeeId: 'emp-z', locationId: 'loc-1', availableDays: 15 } });

      await prisma.timeOffRequest.create({
        data: {
          employeeId: 'emp-z',
          locationId: 'loc-1',
          startDate: new Date('2026-07-01'),
          endDate: new Date('2026-07-03'),
          status: 'PENDING',
        },
      });

      const response = await request(app.getHttpServer())
        .post('/sync/batch')
        .send({
          balances: [
            { employeeId: 'emp-new', locationId: 'loc-1', availableDays: 5 },  // new
            { employeeId: 'emp-x',   locationId: 'loc-1', availableDays: 10 }, // unchanged
            { employeeId: 'emp-y',   locationId: 'loc-1', availableDays: 12 }, // updated
            { employeeId: 'emp-z',   locationId: 'loc-1', availableDays: 3 },  // updated + conflicted
          ],
        })
        .expect(200);

      expect(response.body.summary).toEqual({
        created: 1,
        updated: 2,
        unchanged: 1,
        conflicted: 1,
        failed: 0,
      });
    });

    it('returns 400 when the balances array is empty', async () => {
      await request(app.getHttpServer()).post('/sync/batch').send({ balances: [] }).expect(400);
    });

    it('returns 400 when a balance entry has a negative availableDays', async () => {
      await request(app.getHttpServer())
        .post('/sync/batch')
        .send({ balances: [{ employeeId: 'emp-1', locationId: 'loc-1', availableDays: -1 }] })
        .expect(400);
    });

    it('returns 400 when a balance entry is missing employeeId', async () => {
      await request(app.getHttpServer())
        .post('/sync/batch')
        .send({ balances: [{ locationId: 'loc-1', availableDays: 10 }] })
        .expect(400);
    });
  });
});
```

- [ ] **Step 2: Run integration tests — confirm passing**

```bash
npm run test:integration
```

Expected: all 8 tests in `batch-sync.integration-spec.ts` pass.

- [ ] **Step 3: Run unit tests — confirm no regression**

```bash
npm run test:cov
```

Expected: all tests pass, 100% coverage.

- [ ] **Step 4: Commit**

```bash
git add test/integration/batch-sync.integration-spec.ts
git commit -m "test(f7): add batch sync integration tests

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 9: Update Stryker mutation config and run

**Files:**
- Modify: `stryker.config.mjs`

- [ ] **Step 1: Add `batch-sync.service.ts` to the mutate list**

Replace `stryker.config.mjs`:

```javascript
// @ts-check
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  _comment:
    "This config mirrors the GCB service defaults. Expand the 'mutate' list feature-by-feature as the codebase grows.",
  packageManager: 'npm',
  reporters: ['html', 'clear-text', 'progress'],
  testRunner: 'jest',
  coverageAnalysis: 'perTest',
  mutate: [
    'src/shared/config/env/env.config.ts',
    'src/core/services/balance.service.ts',
    'src/core/services/balance-audit.service.ts',
    'src/shared/core/either/either.ts',
    'src/shared/core/custom-http/custom-http.service.ts',
    'src/shared/providers/hcm/hcm.client.ts',
    'src/core/services/batch-sync.service.ts',
  ],
  thresholds: { high: 100, low: 80, break: 80 },
};

export default config;
```

- [ ] **Step 2: Run mutation tests**

```bash
npm run stryker
```

Expected: `batch-sync.service.ts` scores 100%. All previously-passing files maintain their scores. If any survivors are reported, add test cases to kill them before proceeding.

- [ ] **Step 3: Commit**

```bash
git add stryker.config.mjs
git commit -m "test(f7): add batch-sync.service.ts to Stryker mutation targets

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 10: Update master TDR, commit plan

**Files:**
- Modify: `docs/tdr/master.md`
- Commit: `docs/tdr/feature-plans/f7-hcm-batch-sync-plan.md` (this file)

- [ ] **Step 1: Add plan link to `docs/tdr/master.md`**

After the F7 spec line in the Active Documents section, add:

```markdown
- F7 HCM batch sync plan: [f7-hcm-batch-sync-plan.md](./feature-plans/f7-hcm-batch-sync-plan.md)
```

- [ ] **Step 2: Commit plan and master TDR**

```bash
git add docs/tdr/feature-plans/f7-hcm-batch-sync-plan.md docs/tdr/master.md
git commit -m "docs(f7): add F7 implementation plan, link from master TDR

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Checklist — Spec Coverage

| Spec requirement | Task |
|---|---|
| `BalanceService.upsertBalance` — new pair creates, returns `wasCreated: true` | Task 2 |
| `BalanceService.upsertBalance` — existing pair updates, returns `wasCreated: false` | Task 2 |
| `BatchSyncService.syncBatch` — new balance: create + audit + conflict check + `created++` | Task 4 |
| `BatchSyncService.syncBatch` — unchanged: skip, `unchanged++` | Task 4 |
| `BatchSyncService.syncBatch` — changed: update + audit (correct delta) + conflict check + `updated++` | Task 4 |
| `BatchSyncService.syncBatch` — conflict: `conflicted++`, entry in list | Task 4 |
| `BatchSyncService.syncBatch` — error: `failed++`, entry in errors, continue | Task 4 |
| `SyncController POST /sync/batch` — delegates to service, returns 200 | Task 5 |
| DTO validation: empty array → 400 | Task 8 (integration) |
| DTO validation: negative `availableDays` → 400 | Task 8 (integration) |
| DTO validation: missing field → 400 | Task 8 (integration) |
| Mock HCM `GET /balances` bulk export | Task 7 |
| Integration: all new → `created: 3` | Task 8 |
| Integration: unchanged → `unchanged` count | Task 8 |
| Integration: updated → `updated` count + audit trail | Task 8 |
| Integration: PENDING conflict flagged, balance still updated | Task 8 |
| Integration: mixed payload | Task 8 |
