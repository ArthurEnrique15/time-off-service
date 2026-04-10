# F6 — Time-Off Request Read & List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add read-only access to time-off requests — a single-record GET by ID and a paginated, status-filtered employee list — following the exact service/controller patterns established by F2 and F3.

**Architecture:** A `TimeOffRequestService` in `src/core/services` provides `findById` (returns `TimeOffRequest | null`) and `findAllByEmployee` (returns paginated result). A `TimeOffRequestController` in `src/http/controllers` exposes `GET /time-off-requests/:id` and `GET /time-off-requests` with inline validation. Both are registered in `src/module/providers.ts` and `src/module/controllers.ts`. The Stryker mutate list is expanded to include both new files.

**Tech Stack:** NestJS, Prisma, SQLite, Jest, Supertest

**Spec:** [`docs/tdr/specs/f6-time-off-request-read-list-spec.md`](../specs/f6-time-off-request-read-list-spec.md)

**Worktree:** `.worktrees/f6-time-off-request-read-list` (branch `f6-time-off-request-read-list`)

> **All commands and file paths below are relative to the worktree root:**
> `cd <repo-root>/.worktrees/f6-time-off-request-read-list` before starting.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `AGENTS.md` | Modify | Add Worktree Rule + tighten Documentation Rules |
| `docs/tdr/master.md` | Modify | Add F6 design decisions + links to spec and plan |
| `docs/tdr/specs/f6-time-off-request-read-list-spec.md` | Create | EARS feature spec |
| `docs/tdr/feature-plans/f6-time-off-request-read-list-plan.md` | Create | This file |
| `src/core/services/time-off-request.service.ts` | Create | `findById`, `findAllByEmployee` |
| `src/core/services/time-off-request.service.spec.ts` | Create | Unit tests for service |
| `src/http/controllers/time-off-request.controller.ts` | Create | GET `/time-off-requests/:id` and GET `/time-off-requests` |
| `src/http/controllers/time-off-request.controller.spec.ts` | Create | Unit tests for controller |
| `src/module/providers.ts` | Modify | Register `TimeOffRequestService` |
| `src/module/controllers.ts` | Modify | Register `TimeOffRequestController` |
| `stryker.config.mjs` | Modify | Add service + controller to `mutate` list |
| `test/integration/time-off-request.integration-spec.ts` | Create | Integration tests via Supertest |

---

### Task 0: Fix AGENTS.md + Documentation

**Files:**
- Modify: `AGENTS.md`
- Create: `docs/tdr/specs/f6-time-off-request-read-list-spec.md`
- Create: `docs/tdr/feature-plans/f6-time-off-request-read-list-plan.md`
- Modify: `docs/tdr/master.md`

- [ ] **Step 1: Fix AGENTS.md**

Replace the `## Delivery Flow` section header with a new `## Worktree Rule` section directly above it, and tighten `## Documentation Rules`:

```
## Worktree Rule
- **Never make code or documentation changes directly in the main workspace.**
- Every feature branch must be developed inside a dedicated git worktree under `.worktrees/<branch-name>/`.
- Create the worktree before writing any files: `git worktree add .worktrees/<branch-name> -b <branch-name>`.
- All file reads, edits, and test runs must target the worktree path, not the main workspace path.

## Delivery Flow
...existing content unchanged...

## Documentation Rules
- Keep the master TDR current.
- Save feature specs under `docs/tdr/specs/`. **Do not create any other specs directories.**
- Save feature implementation plans under `docs/tdr/feature-plans/`.
- Save agent work plans under `docs/tdr/agent-plans/`.
- Link new specs and plans from `docs/tdr/master.md`.
- Never create documentation outside the `docs/tdr/` tree unless explicitly instructed.
```

- [ ] **Step 2: Confirm spec file already exists** at `docs/tdr/specs/f6-time-off-request-read-list-spec.md` (created during planning).

- [ ] **Step 3: Confirm this plan file already exists** at `docs/tdr/feature-plans/f6-time-off-request-read-list-plan.md` (this file).

- [ ] **Step 4: Add F6 links to `## Active Documents` in `docs/tdr/master.md`**

Append inside the Active Documents list:
```markdown
- F6 time-off request read/list spec: [f6-time-off-request-read-list-spec.md](./specs/f6-time-off-request-read-list-spec.md)
- F6 time-off request read/list plan: [f6-time-off-request-read-list-plan.md](./feature-plans/f6-time-off-request-read-list-plan.md)
```

- [ ] **Step 5: Add F6 Design Decisions section to `docs/tdr/master.md`**

Append at the end:
```markdown
## F6 Design Decisions

Resolved during F6 brainstorming. These are authoritative for all downstream features
that read time-off requests.

| Decision | Choice | Rationale |
|---|---|---|
| Pagination | Offset/limit (`page`, `limit`) | Employees accumulate many requests; consistent with F3 |
| Extra filters | None beyond `employeeId` + optional `status` | YAGNI |
| Default sort | Descending by `createdAt` | Consistent with F3; most useful default |
| Invalid status value | HTTP 400 | Consistent with F3 invalid-reason behavior |
| Missing `employeeId` on list | HTTP 400 | Consistent with F2 balance list |
| Single request not found | HTTP 404 | Standard REST |
| Inline validation | In controller, no class-validator DTOs | Matches every existing controller |
| `page`/`limit` out of range | Default / cap (1..100) | Matches F3 behavior |
| Paginated response shape | `{ data, pagination: { page, limit, total, totalPages } }` | Consistent with F3 envelope |
```

- [ ] **Step 6: Commit**

```bash
git add AGENTS.md docs/tdr/
git commit -m "docs(f6): add spec, plan, AGENTS.md worktree rule, and master TDR links

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 1: TimeOffRequestService — TDD

**Files:**
- Create: `src/core/services/time-off-request.service.ts`
- Create: `src/core/services/time-off-request.service.spec.ts`

#### Step 1: Write the failing unit tests

- [ ] Create `src/core/services/time-off-request.service.spec.ts`:

```typescript
import type { TimeOffRequest } from '@prisma/client';

import type { PrismaService } from '@app-prisma/prisma.service';

import { TimeOffRequestService } from '@core/services/time-off-request.service';

describe('TimeOffRequestService', () => {
  const mockRequest: TimeOffRequest = {
    id: 'req-1',
    employeeId: 'emp-1',
    locationId: 'loc-1',
    startDate: new Date('2026-06-01'),
    endDate: new Date('2026-06-05'),
    status: 'PENDING',
    createdAt: new Date('2026-05-01T10:00:00Z'),
    updatedAt: new Date('2026-05-01T10:00:00Z'),
  };

  const createService = () => {
    const prismaService = {
      timeOffRequest: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
    } as unknown as PrismaService;

    const service = new TimeOffRequestService(prismaService);

    return { service, prismaService };
  };

  describe('findById', () => {
    it('returns the request when found', async () => {
      const { service, prismaService } = createService();
      (prismaService.timeOffRequest.findUnique as jest.Mock).mockResolvedValue(mockRequest);

      const result = await service.findById('req-1');

      expect(result).toEqual(mockRequest);
      expect(prismaService.timeOffRequest.findUnique).toHaveBeenCalledWith({ where: { id: 'req-1' } });
    });

    it('returns null when not found', async () => {
      const { service, prismaService } = createService();
      (prismaService.timeOffRequest.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findAllByEmployee', () => {
    it('returns paginated results for an employee', async () => {
      const { service, prismaService } = createService();
      (prismaService.timeOffRequest.findMany as jest.Mock).mockResolvedValue([mockRequest]);
      (prismaService.timeOffRequest.count as jest.Mock).mockResolvedValue(1);

      const result = await service.findAllByEmployee('emp-1', { page: 1, limit: 20 });

      expect(result).toEqual({
        data: [mockRequest],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });
      expect(prismaService.timeOffRequest.findMany).toHaveBeenCalledWith({
        where: { employeeId: 'emp-1' },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(prismaService.timeOffRequest.count).toHaveBeenCalledWith({ where: { employeeId: 'emp-1' } });
    });

    it('returns empty data when employee has no requests', async () => {
      const { service, prismaService } = createService();
      (prismaService.timeOffRequest.findMany as jest.Mock).mockResolvedValue([]);
      (prismaService.timeOffRequest.count as jest.Mock).mockResolvedValue(0);

      const result = await service.findAllByEmployee('emp-no-requests', { page: 1, limit: 20 });

      expect(result.data).toEqual([]);
      expect(result.pagination).toEqual({ page: 1, limit: 20, total: 0, totalPages: 0 });
    });

    it('filters by status when provided', async () => {
      const { service, prismaService } = createService();
      (prismaService.timeOffRequest.findMany as jest.Mock).mockResolvedValue([mockRequest]);
      (prismaService.timeOffRequest.count as jest.Mock).mockResolvedValue(1);

      await service.findAllByEmployee('emp-1', { page: 1, limit: 20, status: 'PENDING' });

      expect(prismaService.timeOffRequest.findMany).toHaveBeenCalledWith({
        where: { employeeId: 'emp-1', status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(prismaService.timeOffRequest.count).toHaveBeenCalledWith({
        where: { employeeId: 'emp-1', status: 'PENDING' },
      });
    });

    it('uses descending createdAt sort', async () => {
      const { service, prismaService } = createService();
      (prismaService.timeOffRequest.findMany as jest.Mock).mockResolvedValue([]);
      (prismaService.timeOffRequest.count as jest.Mock).mockResolvedValue(0);

      await service.findAllByEmployee('emp-1', { page: 1, limit: 20 });

      const call = (prismaService.timeOffRequest.findMany as jest.Mock).mock.calls[0][0];
      expect(call.orderBy).toEqual({ createdAt: 'desc' });
    });

    it('computes correct skip for page 2', async () => {
      const { service, prismaService } = createService();
      (prismaService.timeOffRequest.findMany as jest.Mock).mockResolvedValue([]);
      (prismaService.timeOffRequest.count as jest.Mock).mockResolvedValue(0);

      await service.findAllByEmployee('emp-1', { page: 2, limit: 10 });

      const call = (prismaService.timeOffRequest.findMany as jest.Mock).mock.calls[0][0];
      expect(call.skip).toBe(10);
      expect(call.take).toBe(10);
    });

    it('caps limit at 100', async () => {
      const { service, prismaService } = createService();
      (prismaService.timeOffRequest.findMany as jest.Mock).mockResolvedValue([]);
      (prismaService.timeOffRequest.count as jest.Mock).mockResolvedValue(0);

      await service.findAllByEmployee('emp-1', { page: 1, limit: 999 });

      const call = (prismaService.timeOffRequest.findMany as jest.Mock).mock.calls[0][0];
      expect(call.take).toBe(100);
    });

    it('clamps page to minimum 1', async () => {
      const { service, prismaService } = createService();
      (prismaService.timeOffRequest.findMany as jest.Mock).mockResolvedValue([]);
      (prismaService.timeOffRequest.count as jest.Mock).mockResolvedValue(0);

      await service.findAllByEmployee('emp-1', { page: 0, limit: 20 });

      const call = (prismaService.timeOffRequest.findMany as jest.Mock).mock.calls[0][0];
      expect(call.skip).toBe(0);
    });

    it('returns totalPages: 0 when total is 0', async () => {
      const { service, prismaService } = createService();
      (prismaService.timeOffRequest.findMany as jest.Mock).mockResolvedValue([]);
      (prismaService.timeOffRequest.count as jest.Mock).mockResolvedValue(0);

      const result = await service.findAllByEmployee('emp-1', { page: 1, limit: 20 });

      expect(result.pagination.totalPages).toBe(0);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test -- --testPathPattern="time-off-request.service.spec"
```

Expected: FAIL — `Cannot find module '@core/services/time-off-request.service'`

- [ ] **Step 3: Implement `TimeOffRequestService`**

Create `src/core/services/time-off-request.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import type { TimeOffRequest } from '@prisma/client';

import { PrismaService } from '@app-prisma/prisma.service';

export const TIME_OFF_REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;

export type TimeOffRequestStatus = (typeof TIME_OFF_REQUEST_STATUSES)[number];

export type PaginatedRequestList = {
  data: TimeOffRequest[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

const MAX_LIMIT = 100;

@Injectable()
export class TimeOffRequestService {
  constructor(private readonly prismaService: PrismaService) {}

  async findById(id: string): Promise<TimeOffRequest | null> {
    return this.prismaService.timeOffRequest.findUnique({ where: { id } });
  }

  async findAllByEmployee(
    employeeId: string,
    options: { page: number; limit: number; status?: TimeOffRequestStatus },
  ): Promise<PaginatedRequestList> {
    const page = Math.max(options.page, 1);
    const limit = Math.min(Math.max(options.limit, 1), MAX_LIMIT);
    const skip = (page - 1) * limit;

    const where: { employeeId: string; status?: string } = { employeeId };

    if (options.status) {
      where.status = options.status;
    }

    const [data, total] = await Promise.all([
      this.prismaService.timeOffRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prismaService.timeOffRequest.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test -- --testPathPattern="time-off-request.service.spec"
```

Expected: PASS — all tests green

- [ ] **Step 5: Commit**

```bash
git add src/core/services/time-off-request.service.ts \
        src/core/services/time-off-request.service.spec.ts
git commit -m "feat(f6): add TimeOffRequestService with findById and findAllByEmployee

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: TimeOffRequestController — TDD

**Files:**
- Create: `src/http/controllers/time-off-request.controller.ts`
- Create: `src/http/controllers/time-off-request.controller.spec.ts`

- [ ] **Step 1: Write the failing unit tests**

Create `src/http/controllers/time-off-request.controller.spec.ts`:

```typescript
import { BadRequestException, NotFoundException } from '@nestjs/common';

import type { TimeOffRequestService, PaginatedRequestList } from '@core/services/time-off-request.service';

import { TimeOffRequestController } from '@http/controllers/time-off-request.controller';

describe('TimeOffRequestController', () => {
  const mockRequest = {
    id: 'req-1',
    employeeId: 'emp-1',
    locationId: 'loc-1',
    startDate: new Date('2026-06-01'),
    endDate: new Date('2026-06-05'),
    status: 'PENDING',
    createdAt: new Date('2026-05-01T10:00:00Z'),
    updatedAt: new Date('2026-05-01T10:00:00Z'),
  };

  const mockPaginatedResponse: PaginatedRequestList = {
    data: [mockRequest],
    pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
  };

  const createController = () => {
    const timeOffRequestService = {
      findById: jest.fn().mockResolvedValue(mockRequest),
      findAllByEmployee: jest.fn().mockResolvedValue(mockPaginatedResponse),
    } as unknown as TimeOffRequestService;

    const controller = new TimeOffRequestController(timeOffRequestService);

    return { controller, timeOffRequestService };
  };

  describe('findOne', () => {
    it('returns the request when found', async () => {
      const { controller, timeOffRequestService } = createController();

      const result = await controller.findOne('req-1');

      expect(result).toEqual(mockRequest);
      expect(timeOffRequestService.findById).toHaveBeenCalledWith('req-1');
    });

    it('throws NotFoundException when request not found', async () => {
      const { controller, timeOffRequestService } = createController();
      (timeOffRequestService.findById as jest.Mock).mockResolvedValue(null);

      await expect(controller.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('delegates to service with parsed params', async () => {
      const { controller, timeOffRequestService } = createController();

      const result = await controller.findAll('emp-1', 'PENDING', '2', '10');

      expect(result).toEqual(mockPaginatedResponse);
      expect(timeOffRequestService.findAllByEmployee).toHaveBeenCalledWith('emp-1', {
        page: 2,
        limit: 10,
        status: 'PENDING',
      });
    });

    it('uses default page=1 and limit=20 when not provided', async () => {
      const { controller, timeOffRequestService } = createController();

      await controller.findAll('emp-1', undefined, undefined, undefined);

      expect(timeOffRequestService.findAllByEmployee).toHaveBeenCalledWith('emp-1', {
        page: 1,
        limit: 20,
        status: undefined,
      });
    });

    it('throws BadRequestException when employeeId is missing', async () => {
      const { controller } = createController();

      await expect(controller.findAll(undefined as any, undefined, undefined, undefined)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException for invalid status', async () => {
      const { controller } = createController();

      await expect(controller.findAll('emp-1', 'INVALID', undefined, undefined)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('passes undefined status when not provided (returns all)', async () => {
      const { controller, timeOffRequestService } = createController();

      await controller.findAll('emp-1', undefined, undefined, undefined);

      const call = (timeOffRequestService.findAllByEmployee as jest.Mock).mock.calls[0][1];
      expect(call.status).toBeUndefined();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test -- --testPathPattern="time-off-request.controller.spec"
```

Expected: FAIL — `Cannot find module '@http/controllers/time-off-request.controller'`

- [ ] **Step 3: Implement `TimeOffRequestController`**

Create `src/http/controllers/time-off-request.controller.ts`:

```typescript
import { BadRequestException, Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import type { TimeOffRequest } from '@prisma/client';

import {
  TIME_OFF_REQUEST_STATUSES,
  TimeOffRequestService,
  type PaginatedRequestList,
  type TimeOffRequestStatus,
} from '@core/services/time-off-request.service';

@Controller('time-off-requests')
export class TimeOffRequestController {
  constructor(private readonly timeOffRequestService: TimeOffRequestService) {}

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<TimeOffRequest> {
    const request = await this.timeOffRequestService.findById(id);

    if (!request) {
      throw new NotFoundException(`Time-off request ${id} not found`);
    }

    return request;
  }

  @Get()
  async findAll(
    @Query('employeeId') employeeId: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<PaginatedRequestList> {
    if (!employeeId) {
      throw new BadRequestException('employeeId query parameter is required');
    }

    if (status && !TIME_OFF_REQUEST_STATUSES.includes(status as TimeOffRequestStatus)) {
      throw new BadRequestException(`Invalid status: ${status}. Must be one of ${TIME_OFF_REQUEST_STATUSES.join(', ')}`);
    }

    const parsedPage = page ? parseInt(page, 10) : undefined;
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;

    return this.timeOffRequestService.findAllByEmployee(employeeId, {
      page: Number.isFinite(parsedPage) ? parsedPage! : 1,
      limit: Number.isFinite(parsedLimit) ? parsedLimit! : 20,
      status: status as TimeOffRequestStatus | undefined,
    });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test -- --testPathPattern="time-off-request.controller.spec"
```

Expected: PASS — all tests green

- [ ] **Step 5: Commit**

```bash
git add src/http/controllers/time-off-request.controller.ts \
        src/http/controllers/time-off-request.controller.spec.ts
git commit -m "feat(f6): add TimeOffRequestController with GET /:id and GET / endpoints

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Register in Module

**Files:**
- Modify: `src/module/providers.ts`
- Modify: `src/module/controllers.ts`

- [ ] **Step 1: Register the service in `src/module/providers.ts`**

```typescript
import { BalanceAuditService } from '@core/services/balance-audit.service';
import { BalanceService } from '@core/services/balance.service';
import { HealthService } from '@core/services/health.service';
import { TimeOffRequestService } from '@core/services/time-off-request.service';

export const timeOffModuleProviders = [BalanceService, HealthService, BalanceAuditService, TimeOffRequestService];
```

- [ ] **Step 2: Register the controller in `src/module/controllers.ts`**

```typescript
import { BalanceAuditController } from '@http/controllers/balance-audit.controller';
import { BalanceController } from '@http/controllers/balance.controller';
import { HealthController } from '@http/controllers/health.controller';
import { TimeOffRequestController } from '@http/controllers/time-off-request.controller';

export const timeOffModuleControllers = [BalanceController, HealthController, BalanceAuditController, TimeOffRequestController];
```

- [ ] **Step 3: Run full unit test suite to confirm no regressions**

```bash
npm run test:cov
```

Expected: PASS — 100% coverage, all tests green

- [ ] **Step 4: Commit**

```bash
git add src/module/providers.ts src/module/controllers.ts
git commit -m "feat(f6): register TimeOffRequestService and TimeOffRequestController in module

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Integration Tests

**Files:**
- Create: `test/integration/time-off-request.integration-spec.ts`

- [ ] **Step 1: Write the integration tests**

Create `test/integration/time-off-request.integration-spec.ts`:

```typescript
import type { INestApplication } from '@nestjs/common';
import { execSync } from 'node:child_process';
import request from 'supertest';

import type { PrismaService } from '../../src/prisma/prisma.service';
import { startMockHcmServer } from '../support/mock-hcm-server';
import { setTestEnvironment } from '../support/test-env';

describe('Time-off request read integration', () => {
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

    execSync('npx prisma migrate deploy', {
      env: process.env,
      stdio: 'pipe',
    });

    jest.resetModules();

    const { AppModule } = await import('../../src/app.module');
    const { PrismaService: PrismaServiceClass } = await import('../../src/prisma/prisma.service');
    const { Test } = await import('@nestjs/testing');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaServiceClass);
  });

  afterAll(async () => {
    await app.close();
    await closeMockHcm();
    cleanup();
  });

  describe('GET /time-off-requests/:id', () => {
    it('returns 404 for unknown id', async () => {
      const response = await request(app.getHttpServer())
        .get('/time-off-requests/nonexistent-id')
        .expect(404);

      expect(response.body.message).toContain('not found');
    });

    it('returns 200 with the request when found', async () => {
      const created = await prisma.timeOffRequest.create({
        data: {
          employeeId: 'emp-get-one',
          locationId: 'loc-get-one',
          startDate: new Date('2026-06-01'),
          endDate: new Date('2026-06-05'),
          status: 'PENDING',
        },
      });

      const response = await request(app.getHttpServer())
        .get(`/time-off-requests/${created.id}`)
        .expect(200);

      expect(response.body.id).toBe(created.id);
      expect(response.body.employeeId).toBe('emp-get-one');
      expect(response.body.status).toBe('PENDING');
    });
  });

  describe('GET /time-off-requests', () => {
    it('returns 400 when employeeId is missing', async () => {
      await request(app.getHttpServer())
        .get('/time-off-requests')
        .expect(400);
    });

    it('returns 400 for invalid status value', async () => {
      await request(app.getHttpServer())
        .get('/time-off-requests?employeeId=emp-1&status=INVALID')
        .expect(400);
    });

    it('returns 200 with empty data when employee has no requests', async () => {
      const response = await request(app.getHttpServer())
        .get('/time-off-requests?employeeId=emp-no-requests')
        .expect(200);

      expect(response.body.data).toEqual([]);
      expect(response.body.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
      });
    });

    it('returns requests for an employee', async () => {
      await prisma.timeOffRequest.create({
        data: {
          employeeId: 'emp-list',
          locationId: 'loc-list',
          startDate: new Date('2026-07-01'),
          endDate: new Date('2026-07-03'),
          status: 'PENDING',
        },
      });

      const response = await request(app.getHttpServer())
        .get('/time-off-requests?employeeId=emp-list')
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].employeeId).toBe('emp-list');
    });

    it('filters by status', async () => {
      await prisma.timeOffRequest.createMany({
        data: [
          {
            employeeId: 'emp-filter',
            locationId: 'loc-filter',
            startDate: new Date('2026-08-01'),
            endDate: new Date('2026-08-03'),
            status: 'PENDING',
          },
          {
            employeeId: 'emp-filter',
            locationId: 'loc-filter',
            startDate: new Date('2026-09-01'),
            endDate: new Date('2026-09-03'),
            status: 'APPROVED',
          },
        ],
      });

      const response = await request(app.getHttpServer())
        .get('/time-off-requests?employeeId=emp-filter&status=PENDING')
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].status).toBe('PENDING');
    });

    it('returns results sorted descending by createdAt', async () => {
      const older = await prisma.timeOffRequest.create({
        data: {
          employeeId: 'emp-sort',
          locationId: 'loc-sort',
          startDate: new Date('2026-06-01'),
          endDate: new Date('2026-06-02'),
          status: 'PENDING',
        },
      });

      // small delay so createdAt differs
      await new Promise((r) => setTimeout(r, 10));

      const newer = await prisma.timeOffRequest.create({
        data: {
          employeeId: 'emp-sort',
          locationId: 'loc-sort',
          startDate: new Date('2026-07-01'),
          endDate: new Date('2026-07-02'),
          status: 'PENDING',
        },
      });

      const response = await request(app.getHttpServer())
        .get('/time-off-requests?employeeId=emp-sort')
        .expect(200);

      expect(response.body.data[0].id).toBe(newer.id);
      expect(response.body.data[1].id).toBe(older.id);
    });

    it('respects pagination params', async () => {
      // create 3 requests for emp-page
      await prisma.timeOffRequest.createMany({
        data: [
          { employeeId: 'emp-page', locationId: 'loc-page', startDate: new Date('2026-06-01'), endDate: new Date('2026-06-01'), status: 'PENDING' },
          { employeeId: 'emp-page', locationId: 'loc-page', startDate: new Date('2026-07-01'), endDate: new Date('2026-07-01'), status: 'PENDING' },
          { employeeId: 'emp-page', locationId: 'loc-page', startDate: new Date('2026-08-01'), endDate: new Date('2026-08-01'), status: 'PENDING' },
        ],
      });

      const response = await request(app.getHttpServer())
        .get('/time-off-requests?employeeId=emp-page&page=1&limit=2')
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination.total).toBe(3);
      expect(response.body.pagination.totalPages).toBe(2);
      expect(response.body.pagination.limit).toBe(2);
    });
  });
});
```

- [ ] **Step 2: Run the integration tests**

```bash
npm run test:integration -- --testPathPattern="time-off-request.integration"
```

Expected: PASS — all tests green

- [ ] **Step 3: Commit**

```bash
git add test/integration/time-off-request.integration-spec.ts
git commit -m "test(f6): add integration tests for time-off request read endpoints

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: Mutation Testing

**Files:**
- Modify: `stryker.config.mjs`

- [ ] **Step 1: Add the new files to the Stryker mutate list**

```javascript
mutate: [
  'src/shared/config/env/env.config.ts',
  'src/core/services/balance.service.ts',
  'src/core/services/balance-audit.service.ts',
  'src/core/services/time-off-request.service.ts',
  'src/shared/core/either/either.ts',
  'src/shared/core/custom-http/custom-http.service.ts',
  'src/shared/providers/hcm/hcm.client.ts',
],
```

- [ ] **Step 2: Run Stryker (scoped to branch changes)**

```bash
npm run stryker
```

Expected: All mutants killed; score ≥ 80 (thresholds: high 100, low 80, break 80)

- [ ] **Step 3: Commit**

```bash
git add stryker.config.mjs
git commit -m "chore(f6): add time-off-request service to Stryker mutate targets

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: Push and Open PR

- [ ] **Step 1: Final verification**

```bash
npm run lint && npm run typecheck && npm run test:cov && npm run test:integration
```

Expected: All pass, 100% coverage maintained.

- [ ] **Step 2: Push and open PR**

```bash
git push -u origin f6-time-off-request-read-list
gh pr create \
  --title "feat(f6): Time-Off Request Read & List endpoints" \
  --body "## What

Adds read-only access to time-off requests:
- \`GET /time-off-requests/:id\` — single record lookup (404 when not found)
- \`GET /time-off-requests?employeeId=X&status=Y&page=1&limit=20\` — paginated, filtered list

## Design decisions
See master TDR F6 section and \`docs/tdr/specs/f6-time-off-request-read-list-spec.md\`.

## Tests
- Unit: service + controller, 100% coverage
- Integration: 11 scenarios via Supertest
- Mutation: Stryker clean

Closes #6" \
  --base main
```
