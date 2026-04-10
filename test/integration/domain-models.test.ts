import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { execSync } from 'node:child_process';

import type { PrismaService } from '../../src/prisma/prisma.service';
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
    const { PrismaService: PrismaServiceClass } = await import('../../src/prisma/prisma.service');

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
