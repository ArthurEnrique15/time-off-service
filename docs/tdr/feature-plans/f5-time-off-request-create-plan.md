# F5 — Time-Off Request Create & Validate: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `POST /time-off-requests` — validates a new request locally and against HCM, then atomically reserves the balance and creates the request in `PENDING` status.

**Architecture:** A new `TimeOffRequestService` orchestrates a pre-flight local balance check, an HCM `submitTimeOff` call, and a single Prisma transaction that reserves the balance and creates the `TimeOffRequest` record. After the transaction, a `RESERVATION` audit entry is logged. A thin controller delegates to the service and returns `201`.

**Tech Stack:** NestJS, Prisma/SQLite, `class-validator` + `class-transformer` (new), `date-fns` (already installed), HcmClient (F4), BalanceService (F2), BalanceAuditService (F3).

**Worktree:** `.worktrees/f5-time-off-request-create` on branch `f5-time-off-request-create`

**Spec:** `docs/tdr/specs/f5-time-off-request-create-spec.md`

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `src/http/dtos/create-time-off-request.dto.ts` | Validated request body DTO |
| Create | `src/http/dtos/create-time-off-request.dto.spec.ts` | DTO class-validator unit tests |
| Create | `src/core/services/time-off-request.service.ts` | Orchestration service |
| Create | `src/core/services/time-off-request.service.spec.ts` | Service unit tests |
| Create | `src/http/controllers/time-off-request.controller.ts` | Thin POST controller |
| Create | `src/http/controllers/time-off-request.controller.spec.ts` | Controller unit tests |
| Create | `test/integration/time-off-request.integration-spec.ts` | E2E integration tests |
| Modify | `prisma/schema.prisma` | Add `hcmRequestId String?` to `TimeOffRequest` |
| Modify | `src/app.module.ts` | Register global `ValidationPipe` via `APP_PIPE` |
| Modify | `src/module/providers.ts` | Add `TimeOffRequestService` |
| Modify | `src/module/controllers.ts` | Add `TimeOffRequestController` |
| Modify | `stryker.config.mjs` | Add new service to mutation targets |
| Modify | `docs/tdr/master.md` | Link spec and plan |

---

## Task 1: Install class-validator and class-transformer

**Files:**
- Run: `npm install class-validator class-transformer`

- [ ] **Step 1: Install packages**

```bash
cd .worktrees/f5-time-off-request-create
npm install class-validator class-transformer
```

Expected: `package.json` now lists `class-validator` and `class-transformer` in `dependencies`.

- [ ] **Step 2: Verify install**

```bash
node -e "require('class-validator'); require('class-transformer'); console.log('ok')"
```

Expected output: `ok`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install class-validator and class-transformer"
```

---

## Task 2: Register global ValidationPipe via APP_PIPE

**Files:**
- Modify: `src/app.module.ts`

Using `APP_PIPE` (instead of `app.useGlobalPipes()` in `main.ts`) ensures the pipe is active in integration tests that call `Test.createTestingModule` without going through `bootstrap()`.

- [ ] **Step 1: Write the failing test**

Open `src/module/module.spec.ts`. Add a test that verifies the `APP_PIPE` provider is present. Actually, this will be validated through the integration test (Task 7). For now, just add the provider and verify the unit test suite still passes.

- [ ] **Step 2: Modify `src/app.module.ts`**

Replace the entire file with:

```typescript
import { APP_PIPE } from '@nestjs/core';
import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { TimeOffModule } from '@module/time-off.module';

import { EnvConfigModule, envValidationSchema, getEnvConfig } from '@shared/config/env';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [getEnvConfig],
      validationSchema: envValidationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: true,
      },
    }),
    EnvConfigModule,
    TimeOffModule,
  ],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false }),
    },
  ],
})
export class AppModule {}
```

- [ ] **Step 3: Run existing tests to confirm no regressions**

```bash
npm run test:cov
```

Expected: 92 tests pass, 100% coverage.

- [ ] **Step 4: Commit**

```bash
git add src/app.module.ts
git commit -m "feat: register global ValidationPipe via APP_PIPE"
```

---

## Task 3: Add hcmRequestId to TimeOffRequest schema + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_hcm_request_id_to_time_off_request/migration.sql` (generated)

- [ ] **Step 1: Update `prisma/schema.prisma`**

Replace the `TimeOffRequest` model block with:

```prisma
model TimeOffRequest {
  id           String   @id @default(uuid())
  employeeId   String
  locationId   String
  startDate    DateTime
  endDate      DateTime
  status       String   @default("PENDING")
  hcmRequestId String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  auditEntries BalanceAuditEntry[]

  @@index([employeeId, status])
}
```

- [ ] **Step 2: Generate and apply the migration**

```bash
npx prisma migrate dev --name add_hcm_request_id_to_time_off_request
```

Expected: A new migration folder appears under `prisma/migrations/` and Prisma Client is regenerated.

- [ ] **Step 3: Run existing tests to confirm no regressions**

```bash
npm run test:cov
```

Expected: 92 tests pass, 100% coverage.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(f5): add hcmRequestId field to TimeOffRequest schema"
```

---

## Task 4: CreateTimeOffRequestDto (TDD)

**Files:**
- Create: `src/http/dtos/create-time-off-request.dto.ts`
- Create: `src/http/dtos/create-time-off-request.dto.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/http/dtos/create-time-off-request.dto.spec.ts`:

```typescript
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import { CreateTimeOffRequestDto } from './create-time-off-request.dto';

const validPayload = {
  employeeId: 'emp-1',
  locationId: 'loc-1',
  startDate: '2025-06-01',
  endDate: '2025-06-05',
};

describe('CreateTimeOffRequestDto', () => {
  it('passes validation with a complete valid payload', async () => {
    const dto = plainToInstance(CreateTimeOffRequestDto, validPayload);
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('fails when employeeId is missing', async () => {
    const dto = plainToInstance(CreateTimeOffRequestDto, { ...validPayload, employeeId: undefined });
    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'employeeId')).toBe(true);
  });

  it('fails when locationId is missing', async () => {
    const dto = plainToInstance(CreateTimeOffRequestDto, { ...validPayload, locationId: undefined });
    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'locationId')).toBe(true);
  });

  it('fails when startDate is missing', async () => {
    const dto = plainToInstance(CreateTimeOffRequestDto, { ...validPayload, startDate: undefined });
    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'startDate')).toBe(true);
  });

  it('fails when endDate is missing', async () => {
    const dto = plainToInstance(CreateTimeOffRequestDto, { ...validPayload, endDate: undefined });
    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'endDate')).toBe(true);
  });

  it('fails when startDate is not a valid ISO 8601 date string', async () => {
    const dto = plainToInstance(CreateTimeOffRequestDto, { ...validPayload, startDate: 'not-a-date' });
    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'startDate')).toBe(true);
  });

  it('fails when endDate is not a valid ISO 8601 date string', async () => {
    const dto = plainToInstance(CreateTimeOffRequestDto, { ...validPayload, endDate: 'not-a-date' });
    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'endDate')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest src/http/dtos/create-time-off-request.dto.spec.ts --no-coverage
```

Expected: FAIL — `Cannot find module './create-time-off-request.dto'`

- [ ] **Step 3: Write the DTO implementation**

Create `src/http/dtos/create-time-off-request.dto.ts`:

```typescript
import { IsDateString, IsNotEmpty, IsString } from 'class-validator';

export class CreateTimeOffRequestDto {
  @IsString()
  @IsNotEmpty()
  employeeId: string;

  @IsString()
  @IsNotEmpty()
  locationId: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest src/http/dtos/create-time-off-request.dto.spec.ts --no-coverage
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/http/dtos/
git commit -m "feat(f5): add CreateTimeOffRequestDto with class-validator decorators"
```

---

## Task 5: TimeOffRequestService (TDD)

**Files:**
- Create: `src/core/services/time-off-request.service.spec.ts`
- Create: `src/core/services/time-off-request.service.ts`

### Key behaviour

1. Validates date order: `startDate` must not be after `endDate`.
2. Fetches local balance; throws `NotFoundException` if missing.
3. Checks `availableDays >= daysRequested`; throws `InsufficientBalanceError` if not.
4. Calls `HcmClient.submitTimeOff`; maps `Failure` codes to HTTP exceptions.
5. Executes a Prisma transaction: inline balance update + `timeOffRequest.create`.
6. After transaction: calls `BalanceAuditService.recordEntry` with `reason: 'RESERVATION'`.
7. Returns the created `TimeOffRequest`.

- [ ] **Step 1: Write the failing tests**

Create `src/core/services/time-off-request.service.spec.ts`:

```typescript
import { BadRequestException, NotFoundException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '@app-prisma/prisma.service';
import { BalanceAuditService } from '@core/services/balance-audit.service';
import { BalanceService } from '@core/services/balance.service';
import { TimeOffRequestService } from '@core/services/time-off-request.service';
import { InsufficientBalanceError } from '@shared/errors/insufficient-balance.error';
import { Failure, Success } from '@shared/core/either';
import { HcmClient } from '@shared/providers/hcm/hcm.client';

describe('TimeOffRequestService', () => {
  let service: TimeOffRequestService;

  const mockBalance = {
    id: 'balance-1',
    employeeId: 'emp-1',
    locationId: 'loc-1',
    availableDays: 20,
    reservedDays: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockRequest = {
    id: 'req-1',
    employeeId: 'emp-1',
    locationId: 'loc-1',
    startDate: new Date('2025-06-01'),
    endDate: new Date('2025-06-05'),
    status: 'PENDING',
    hcmRequestId: 'hcm-req-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockBalanceService = {
    findByEmployeeAndLocation: jest.fn(),
  };

  const mockBalanceAuditService = {
    recordEntry: jest.fn(),
  };

  const mockHcmClient = {
    submitTimeOff: jest.fn(),
  };

  const mockPrismaService = {
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default: transaction runs the callback with a tx that has balance + timeOffRequest
    mockPrismaService.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
      const tx = {
        balance: {
          findUnique: jest.fn().mockResolvedValue(mockBalance),
          update: jest.fn().mockResolvedValue({ ...mockBalance, availableDays: 15, reservedDays: 5 }),
        },
        timeOffRequest: {
          create: jest.fn().mockResolvedValue(mockRequest),
        },
      };
      return cb(tx);
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TimeOffRequestService,
        { provide: BalanceService, useValue: mockBalanceService },
        { provide: BalanceAuditService, useValue: mockBalanceAuditService },
        { provide: HcmClient, useValue: mockHcmClient },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<TimeOffRequestService>(TimeOffRequestService);
  });

  const validDto = {
    employeeId: 'emp-1',
    locationId: 'loc-1',
    startDate: '2025-06-01',
    endDate: '2025-06-05',
  };

  describe('create — happy path', () => {
    it('returns the created TimeOffRequest', async () => {
      mockBalanceService.findByEmployeeAndLocation.mockResolvedValue(mockBalance);
      mockHcmClient.submitTimeOff.mockResolvedValue(Success.create({ id: 'hcm-req-1', status: 'APPROVED' }));

      const result = await service.create(validDto);

      expect(result).toEqual(mockRequest);
    });

    it('calls BalanceAuditService.recordEntry with RESERVATION reason', async () => {
      mockBalanceService.findByEmployeeAndLocation.mockResolvedValue(mockBalance);
      mockHcmClient.submitTimeOff.mockResolvedValue(Success.create({ id: 'hcm-req-1', status: 'APPROVED' }));
      mockBalanceAuditService.recordEntry.mockResolvedValue({});

      await service.create(validDto);

      expect(mockBalanceAuditService.recordEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          balanceId: 'balance-1',
          delta: -5,
          reason: 'RESERVATION',
          requestId: 'req-1',
        }),
      );
    });

    it('calls HcmClient.submitTimeOff with the correct request data', async () => {
      mockBalanceService.findByEmployeeAndLocation.mockResolvedValue(mockBalance);
      mockHcmClient.submitTimeOff.mockResolvedValue(Success.create({ id: 'hcm-req-1', status: 'APPROVED' }));

      await service.create(validDto);

      expect(mockHcmClient.submitTimeOff).toHaveBeenCalledWith({
        employeeId: 'emp-1',
        locationId: 'loc-1',
        startDate: '2025-06-01',
        endDate: '2025-06-05',
      });
    });

    it('stores hcmRequestId from HCM response on the created request', async () => {
      mockBalanceService.findByEmployeeAndLocation.mockResolvedValue(mockBalance);
      mockHcmClient.submitTimeOff.mockResolvedValue(Success.create({ id: 'hcm-req-99', status: 'APPROVED' }));

      mockPrismaService.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
        const tx = {
          balance: {
            findUnique: jest.fn().mockResolvedValue(mockBalance),
            update: jest.fn().mockResolvedValue(mockBalance),
          },
          timeOffRequest: {
            create: jest.fn().mockImplementation(({ data }: any) =>
              Promise.resolve({ ...mockRequest, hcmRequestId: data.hcmRequestId }),
            ),
          },
        };
        return cb(tx);
      });

      const result = await service.create(validDto);

      expect(result.hcmRequestId).toBe('hcm-req-99');
    });
  });

  describe('create — date validation', () => {
    it('throws BadRequestException when startDate is after endDate', async () => {
      await expect(
        service.create({ ...validDto, startDate: '2025-06-10', endDate: '2025-06-05' }),
      ).rejects.toThrow(BadRequestException);

      expect(mockHcmClient.submitTimeOff).not.toHaveBeenCalled();
    });
  });

  describe('create — local balance check', () => {
    it('throws NotFoundException when balance does not exist', async () => {
      mockBalanceService.findByEmployeeAndLocation.mockResolvedValue(null);

      await expect(service.create(validDto)).rejects.toThrow(NotFoundException);
      expect(mockHcmClient.submitTimeOff).not.toHaveBeenCalled();
    });

    it('throws InsufficientBalanceError when available days < days requested', async () => {
      mockBalanceService.findByEmployeeAndLocation.mockResolvedValue({
        ...mockBalance,
        availableDays: 2,
      });

      await expect(service.create(validDto)).rejects.toThrow(InsufficientBalanceError);
      expect(mockHcmClient.submitTimeOff).not.toHaveBeenCalled();
    });
  });

  describe('create — HCM error mapping', () => {
    it('throws BadRequestException when HCM returns INSUFFICIENT_BALANCE', async () => {
      mockBalanceService.findByEmployeeAndLocation.mockResolvedValue(mockBalance);
      mockHcmClient.submitTimeOff.mockResolvedValue(
        Failure.create({ code: 'INSUFFICIENT_BALANCE', message: 'not enough', statusCode: 400 }),
      );

      await expect(service.create(validDto)).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('throws UnprocessableEntityException when HCM returns INVALID_DIMENSIONS', async () => {
      mockBalanceService.findByEmployeeAndLocation.mockResolvedValue(mockBalance);
      mockHcmClient.submitTimeOff.mockResolvedValue(
        Failure.create({ code: 'INVALID_DIMENSIONS', message: 'bad dims', statusCode: 400 }),
      );

      await expect(service.create(validDto)).rejects.toThrow(UnprocessableEntityException);
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('throws ServiceUnavailableException when HCM returns UNKNOWN', async () => {
      mockBalanceService.findByEmployeeAndLocation.mockResolvedValue(mockBalance);
      mockHcmClient.submitTimeOff.mockResolvedValue(
        Failure.create({ code: 'UNKNOWN', message: 'network error', statusCode: 500 }),
      );

      await expect(service.create(validDto)).rejects.toThrow(ServiceUnavailableException);
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest src/core/services/time-off-request.service.spec.ts --no-coverage
```

Expected: FAIL — `Cannot find module '@core/services/time-off-request.service'`

- [ ] **Step 3: Write the service implementation**

Create `src/core/services/time-off-request.service.ts`:

```typescript
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { TimeOffRequest } from '@prisma/client';
import { differenceInCalendarDays, isAfter, parseISO } from 'date-fns';

import { PrismaService } from '@app-prisma/prisma.service';
import { BalanceAuditService } from '@core/services/balance-audit.service';
import { BalanceService } from '@core/services/balance.service';
import { InsufficientBalanceError } from '@shared/errors/insufficient-balance.error';
import { HcmClient } from '@shared/providers/hcm/hcm.client';
import type { HcmError } from '@shared/providers/hcm/hcm.types';

import type { CreateTimeOffRequestDto } from '@http/dtos/create-time-off-request.dto';

@Injectable()
export class TimeOffRequestService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly balanceService: BalanceService,
    private readonly balanceAuditService: BalanceAuditService,
    private readonly hcmClient: HcmClient,
  ) {}

  async create(dto: CreateTimeOffRequestDto): Promise<TimeOffRequest> {
    const { employeeId, locationId, startDate, endDate } = dto;

    if (isAfter(parseISO(startDate), parseISO(endDate))) {
      throw new BadRequestException('startDate must be before or equal to endDate');
    }

    const daysRequested = differenceInCalendarDays(parseISO(endDate), parseISO(startDate)) + 1;

    const balance = await this.balanceService.findByEmployeeAndLocation(employeeId, locationId);

    if (!balance) {
      throw new NotFoundException(
        `Balance not found for employee ${employeeId} at location ${locationId}`,
      );
    }

    if (balance.availableDays < daysRequested) {
      throw new InsufficientBalanceError(employeeId, locationId, daysRequested, balance.availableDays);
    }

    const hcmResult = await this.hcmClient.submitTimeOff({ employeeId, locationId, startDate, endDate });

    if (hcmResult.isFailure()) {
      this.throwHcmError(hcmResult.value);
    }

    const hcmRequestId = hcmResult.isSuccess() ? hcmResult.value.id : undefined;

    let createdRequest!: TimeOffRequest;

    await this.prismaService.$transaction(async (tx) => {
      const currentBalance = await tx.balance.findUnique({
        where: { employeeId_locationId: { employeeId, locationId } },
      });

      if (!currentBalance) {
        throw new NotFoundException(
          `Balance not found for employee ${employeeId} at location ${locationId}`,
        );
      }

      if (currentBalance.availableDays < daysRequested) {
        throw new InsufficientBalanceError(
          employeeId,
          locationId,
          daysRequested,
          currentBalance.availableDays,
        );
      }

      await tx.balance.update({
        where: { employeeId_locationId: { employeeId, locationId } },
        data: {
          availableDays: { decrement: daysRequested },
          reservedDays: { increment: daysRequested },
        },
      });

      createdRequest = await tx.timeOffRequest.create({
        data: {
          employeeId,
          locationId,
          startDate: parseISO(startDate),
          endDate: parseISO(endDate),
          status: 'PENDING',
          hcmRequestId,
        },
      });
    });

    await this.balanceAuditService.recordEntry({
      balanceId: balance.id,
      delta: -daysRequested,
      reason: 'RESERVATION',
      requestId: createdRequest.id,
    });

    return createdRequest;
  }

  private throwHcmError(error: HcmError): never {
    switch (error.code) {
      case 'INSUFFICIENT_BALANCE':
        throw new BadRequestException(error.message);
      case 'INVALID_DIMENSIONS':
        throw new UnprocessableEntityException(error.message);
      default:
        throw new ServiceUnavailableException('HCM service is unavailable');
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest src/core/services/time-off-request.service.spec.ts --no-coverage
```

Expected: All tests pass.

- [ ] **Step 5: Run full test suite to verify no regressions**

```bash
npm run test:cov
```

Expected: Tests pass, 100% coverage (new files will be covered by their own specs).

- [ ] **Step 6: Commit**

```bash
git add src/core/services/time-off-request.service.ts src/core/services/time-off-request.service.spec.ts
git commit -m "feat(f5): add TimeOffRequestService with local + HCM validation"
```

---

## Task 6: TimeOffRequestController (TDD)

**Files:**
- Create: `src/http/controllers/time-off-request.controller.spec.ts`
- Create: `src/http/controllers/time-off-request.controller.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/http/controllers/time-off-request.controller.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';

import { TimeOffRequestService } from '@core/services/time-off-request.service';
import { TimeOffRequestController } from '@http/controllers/time-off-request.controller';
import type { CreateTimeOffRequestDto } from '@http/dtos/create-time-off-request.dto';

describe('TimeOffRequestController', () => {
  let controller: TimeOffRequestController;

  const mockRequest = {
    id: 'req-1',
    employeeId: 'emp-1',
    locationId: 'loc-1',
    startDate: new Date('2025-06-01'),
    endDate: new Date('2025-06-05'),
    status: 'PENDING',
    hcmRequestId: 'hcm-req-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTimeOffRequestService = {
    create: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TimeOffRequestController],
      providers: [{ provide: TimeOffRequestService, useValue: mockTimeOffRequestService }],
    }).compile();

    controller = module.get<TimeOffRequestController>(TimeOffRequestController);
  });

  describe('create', () => {
    it('delegates to TimeOffRequestService.create and returns the result', async () => {
      const dto: CreateTimeOffRequestDto = {
        employeeId: 'emp-1',
        locationId: 'loc-1',
        startDate: '2025-06-01',
        endDate: '2025-06-05',
      };
      mockTimeOffRequestService.create.mockResolvedValue(mockRequest);

      const result = await controller.create(dto);

      expect(result).toEqual(mockRequest);
      expect(mockTimeOffRequestService.create).toHaveBeenCalledWith(dto);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest src/http/controllers/time-off-request.controller.spec.ts --no-coverage
```

Expected: FAIL — `Cannot find module '@http/controllers/time-off-request.controller'`

- [ ] **Step 3: Write the controller implementation**

Create `src/http/controllers/time-off-request.controller.ts`:

```typescript
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { TimeOffRequest } from '@prisma/client';

import { TimeOffRequestService } from '@core/services/time-off-request.service';
import { CreateTimeOffRequestDto } from '@http/dtos/create-time-off-request.dto';

@Controller('time-off-requests')
export class TimeOffRequestController {
  constructor(private readonly timeOffRequestService: TimeOffRequestService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateTimeOffRequestDto): Promise<TimeOffRequest> {
    return this.timeOffRequestService.create(dto);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest src/http/controllers/time-off-request.controller.spec.ts --no-coverage
```

Expected: 1 test passes.

- [ ] **Step 5: Commit**

```bash
git add src/http/controllers/time-off-request.controller.ts src/http/controllers/time-off-request.controller.spec.ts
git commit -m "feat(f5): add TimeOffRequestController with POST /time-off-requests"
```

---

## Task 7: Module wiring

**Files:**
- Modify: `src/module/providers.ts`
- Modify: `src/module/controllers.ts`

- [ ] **Step 1: Add `TimeOffRequestService` to providers**

Replace `src/module/providers.ts` with:

```typescript
import { BalanceAuditService } from '@core/services/balance-audit.service';
import { BalanceService } from '@core/services/balance.service';
import { HealthService } from '@core/services/health.service';
import { TimeOffRequestService } from '@core/services/time-off-request.service';

export const timeOffModuleProviders = [BalanceService, HealthService, BalanceAuditService, TimeOffRequestService];
```

- [ ] **Step 2: Add `TimeOffRequestController` to controllers**

Replace `src/module/controllers.ts` with:

```typescript
import { BalanceAuditController } from '@http/controllers/balance-audit.controller';
import { BalanceController } from '@http/controllers/balance.controller';
import { HealthController } from '@http/controllers/health.controller';
import { TimeOffRequestController } from '@http/controllers/time-off-request.controller';

export const timeOffModuleControllers = [BalanceController, HealthController, BalanceAuditController, TimeOffRequestController];
```

- [ ] **Step 3: Run full test suite to verify wiring is correct**

```bash
npm run test:cov
```

Expected: All tests pass, 100% coverage.

- [ ] **Step 4: Commit**

```bash
git add src/module/providers.ts src/module/controllers.ts
git commit -m "feat(f5): wire TimeOffRequestService and TimeOffRequestController into module"
```

---

## Task 8: Integration tests

**Files:**
- Create: `test/integration/time-off-request.integration-spec.ts`

This test seeds both the local DB and the mock HCM server with a balance, then exercises `POST /time-off-requests` for all scenarios.

- [ ] **Step 1: Write the integration test**

Create `test/integration/time-off-request.integration-spec.ts`:

```typescript
import type { INestApplication } from '@nestjs/common';
import { execSync } from 'node:child_process';
import request from 'supertest';

import type { PrismaService } from '../../src/prisma/prisma.service';
import { startMockHcmServer } from '../support/mock-hcm-server';
import { setTestEnvironment } from '../support/test-env';

describe('Time-off request creation integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cleanup: () => void;
  let closeMockHcm: () => Promise<void>;

  const EMPLOYEE_ID = 'emp-f5';
  const LOCATION_ID = 'loc-f5';

  beforeAll(async () => {
    const mockHcmServer = await startMockHcmServer({
      balances: [
        { employeeId: EMPLOYEE_ID, locationId: LOCATION_ID, availableDays: 20 },
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

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaServiceClass);

    // Seed local balance
    await prisma.balance.create({
      data: { employeeId: EMPLOYEE_ID, locationId: LOCATION_ID, availableDays: 20 },
    });
  });

  afterEach(async () => {
    await prisma.balanceAuditEntry.deleteMany({});
    await prisma.timeOffRequest.deleteMany({});
    // Reset balance after each test
    await prisma.balance.updateMany({
      where: { employeeId: EMPLOYEE_ID, locationId: LOCATION_ID },
      data: { availableDays: 20, reservedDays: 0 },
    });
  });

  afterAll(async () => {
    await prisma.balance.deleteMany({});
    await app.close();
    await closeMockHcm();
    cleanup();
  });

  describe('POST /time-off-requests', () => {
    it('returns 201 with the created request on a valid submission', async () => {
      const response = await request(app.getHttpServer())
        .post('/time-off-requests')
        .send({
          employeeId: EMPLOYEE_ID,
          locationId: LOCATION_ID,
          startDate: '2025-06-01',
          endDate: '2025-06-05',
        })
        .expect(201);

      expect(response.body.employeeId).toBe(EMPLOYEE_ID);
      expect(response.body.locationId).toBe(LOCATION_ID);
      expect(response.body.status).toBe('PENDING');
      expect(response.body.hcmRequestId).toBeDefined();
      expect(response.body.id).toBeDefined();
    });

    it('creates the TimeOffRequest record in the database', async () => {
      await request(app.getHttpServer())
        .post('/time-off-requests')
        .send({
          employeeId: EMPLOYEE_ID,
          locationId: LOCATION_ID,
          startDate: '2025-06-01',
          endDate: '2025-06-05',
        })
        .expect(201);

      const record = await prisma.timeOffRequest.findFirst({
        where: { employeeId: EMPLOYEE_ID },
      });

      expect(record).not.toBeNull();
      expect(record!.status).toBe('PENDING');
      expect(record!.hcmRequestId).toBeDefined();
    });

    it('decrements availableDays and increments reservedDays on the balance', async () => {
      await request(app.getHttpServer())
        .post('/time-off-requests')
        .send({
          employeeId: EMPLOYEE_ID,
          locationId: LOCATION_ID,
          startDate: '2025-06-01',
          endDate: '2025-06-05', // 5 days
        })
        .expect(201);

      const balance = await prisma.balance.findUnique({
        where: { employeeId_locationId: { employeeId: EMPLOYEE_ID, locationId: LOCATION_ID } },
      });

      expect(balance!.availableDays).toBe(15);
      expect(balance!.reservedDays).toBe(5);
    });

    it('creates a RESERVATION audit entry after successful creation', async () => {
      await request(app.getHttpServer())
        .post('/time-off-requests')
        .send({
          employeeId: EMPLOYEE_ID,
          locationId: LOCATION_ID,
          startDate: '2025-06-01',
          endDate: '2025-06-05',
        })
        .expect(201);

      const balance = await prisma.balance.findUnique({
        where: { employeeId_locationId: { employeeId: EMPLOYEE_ID, locationId: LOCATION_ID } },
      });

      const auditEntries = await prisma.balanceAuditEntry.findMany({
        where: { balanceId: balance!.id },
      });

      expect(auditEntries).toHaveLength(1);
      expect(auditEntries[0].reason).toBe('RESERVATION');
      expect(auditEntries[0].delta).toBe(-5);
      expect(auditEntries[0].requestId).toBeDefined();
    });

    it('returns 400 when a required field is missing', async () => {
      await request(app.getHttpServer())
        .post('/time-off-requests')
        .send({ employeeId: EMPLOYEE_ID, locationId: LOCATION_ID, startDate: '2025-06-01' })
        .expect(400);
    });

    it('returns 400 when startDate is after endDate', async () => {
      await request(app.getHttpServer())
        .post('/time-off-requests')
        .send({
          employeeId: EMPLOYEE_ID,
          locationId: LOCATION_ID,
          startDate: '2025-06-10',
          endDate: '2025-06-05',
        })
        .expect(400);
    });

    it('returns 404 when local balance does not exist', async () => {
      await request(app.getHttpServer())
        .post('/time-off-requests')
        .send({
          employeeId: 'emp-nonexistent',
          locationId: 'loc-nonexistent',
          startDate: '2025-06-01',
          endDate: '2025-06-05',
        })
        .expect(404);
    });

    it('returns 400 when local balance is insufficient', async () => {
      await prisma.balance.updateMany({
        where: { employeeId: EMPLOYEE_ID, locationId: LOCATION_ID },
        data: { availableDays: 1 },
      });

      await request(app.getHttpServer())
        .post('/time-off-requests')
        .send({
          employeeId: EMPLOYEE_ID,
          locationId: LOCATION_ID,
          startDate: '2025-06-01',
          endDate: '2025-06-05', // 5 days, but only 1 available
        })
        .expect(400);
    });

    it('returns 422 when HCM rejects due to INVALID_DIMENSIONS', async () => {
      // Use a location that is NOT seeded in the mock HCM server
      await prisma.balance.create({
        data: { employeeId: EMPLOYEE_ID, locationId: 'loc-unknown-in-hcm', availableDays: 20 },
      });

      await request(app.getHttpServer())
        .post('/time-off-requests')
        .send({
          employeeId: EMPLOYEE_ID,
          locationId: 'loc-unknown-in-hcm',
          startDate: '2025-06-01',
          endDate: '2025-06-05',
        })
        .expect(422);

      await prisma.balance.deleteMany({ where: { locationId: 'loc-unknown-in-hcm' } });
    });
  });
});
```

- [ ] **Step 2: Run the integration test**

```bash
npx jest test/integration/time-off-request.integration-spec.ts --config jest.integration.config.ts --no-coverage
```

Expected: All integration tests pass.

- [ ] **Step 3: Run full unit test suite to confirm no regressions**

```bash
npm run test:cov
```

Expected: All tests pass, 100% coverage.

- [ ] **Step 4: Commit**

```bash
git add test/integration/time-off-request.integration-spec.ts
git commit -m "test(f5): add integration tests for POST /time-off-requests"
```

---

## Task 9: Stryker and TDR update

**Files:**
- Modify: `stryker.config.mjs`
- Modify: `docs/tdr/master.md`

- [ ] **Step 1: Add new service to Stryker mutate list**

In `stryker.config.mjs`, update the `mutate` array to include:

```js
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

- [ ] **Step 2: Run Stryker against new files only**

```bash
npm run stryker
```

Expected: All mutants killed, score ≥ 80% (target 100%).

- [ ] **Step 3: Link spec and plan in `docs/tdr/master.md`**

Add these two lines under `## Active Documents`:

```markdown
- F5 time-off request create spec: [f5-time-off-request-create-spec.md](./specs/f5-time-off-request-create-spec.md)
- F5 time-off request create plan: [f5-time-off-request-create-plan.md](./feature-plans/f5-time-off-request-create-plan.md)
```

- [ ] **Step 4: Copy this plan to the repository docs**

```bash
cp /path/to/session/plan.md docs/tdr/feature-plans/f5-time-off-request-create-plan.md
```

(Replace `/path/to/session/plan.md` with the actual session plan path.)

- [ ] **Step 5: Commit**

```bash
git add stryker.config.mjs docs/tdr/master.md docs/tdr/feature-plans/f5-time-off-request-create-plan.md
git commit -m "chore(f5): update Stryker targets and link F5 docs in TDR"
```

---

## Known Limitations (F11 scope)

- **TOCTOU between HCM submit and DB transaction**: If the HCM call succeeds but the local transaction fails, the HCM has an approved request without a local record. This is an F11 error-recovery concern.
- **No HCM rollback on transaction failure**: F9 (HCM Sync on Approval) and F11 (Error Hardening) will address recovery strategies.
