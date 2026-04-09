import type { INestApplication } from '@nestjs/common';
import { execSync } from 'node:child_process';
import request from 'supertest';

import type { PrismaService } from '../../src/prisma/prisma.service';
import { startMockHcmServer } from '../support/mock-hcm-server';
import { setTestEnvironment } from '../support/test-env';

describe('Balance audit trail integration', () => {
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

  it('returns 404 when balance does not exist', async () => {
    const response = await request(app.getHttpServer())
      .get('/balances/nonexistent-emp/nonexistent-loc/history')
      .expect(404);

    expect(response.body.message).toContain('Balance not found');
  });

  it('returns empty data array when balance exists but has no audit entries', async () => {
    await prisma.balance.create({
      data: { employeeId: 'emp-empty', locationId: 'loc-empty', availableDays: 10 },
    });

    const response = await request(app.getHttpServer()).get('/balances/emp-empty/loc-empty/history').expect(200);

    expect(response.body.data).toEqual([]);
    expect(response.body.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
    });
  });

  it('returns audit entries sorted descending by createdAt', async () => {
    const balance = await prisma.balance.create({
      data: { employeeId: 'emp-sort', locationId: 'loc-sort', availableDays: 20 },
    });

    await prisma.balanceAuditEntry.create({
      data: {
        balanceId: balance.id,
        delta: -3,
        reason: 'RESERVATION',
        actorId: 'actor-1',
      },
    });

    // Small delay to ensure distinct timestamps
    await new Promise((resolve) => setTimeout(resolve, 10));

    await prisma.balanceAuditEntry.create({
      data: {
        balanceId: balance.id,
        delta: 3,
        reason: 'RESERVATION_RELEASE',
        actorId: 'actor-1',
      },
    });

    const response = await request(app.getHttpServer()).get('/balances/emp-sort/loc-sort/history').expect(200);

    expect(response.body.data).toHaveLength(2);
    expect(response.body.data[0].reason).toBe('RESERVATION_RELEASE');
    expect(response.body.data[1].reason).toBe('RESERVATION');
  });

  it('paginates correctly', async () => {
    const balance = await prisma.balance.create({
      data: { employeeId: 'emp-page', locationId: 'loc-page', availableDays: 30 },
    });

    for (let i = 0; i < 5; i++) {
      await prisma.balanceAuditEntry.create({
        data: {
          balanceId: balance.id,
          delta: -1,
          reason: 'RESERVATION',
        },
      });
    }

    const page1 = await request(app.getHttpServer())
      .get('/balances/emp-page/loc-page/history?page=1&limit=2')
      .expect(200);

    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.pagination).toEqual({
      page: 1,
      limit: 2,
      total: 5,
      totalPages: 3,
    });

    const page3 = await request(app.getHttpServer())
      .get('/balances/emp-page/loc-page/history?page=3&limit=2')
      .expect(200);

    expect(page3.body.data).toHaveLength(1);
    expect(page3.body.pagination).toEqual({
      page: 3,
      limit: 2,
      total: 5,
      totalPages: 3,
    });
  });

  it('filters by reason query param', async () => {
    const balance = await prisma.balance.create({
      data: { employeeId: 'emp-filter', locationId: 'loc-filter', availableDays: 15 },
    });

    await prisma.balanceAuditEntry.create({
      data: { balanceId: balance.id, delta: -2, reason: 'RESERVATION' },
    });

    await prisma.balanceAuditEntry.create({
      data: { balanceId: balance.id, delta: 5, reason: 'BATCH_SYNC' },
    });

    const response = await request(app.getHttpServer())
      .get('/balances/emp-filter/loc-filter/history?reason=BATCH_SYNC')
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].reason).toBe('BATCH_SYNC');
    expect(response.body.pagination.total).toBe(1);
  });

  it('returns 400 for invalid reason query param', async () => {
    await prisma.balance.create({
      data: { employeeId: 'emp-bad', locationId: 'loc-bad', availableDays: 10 },
    });

    const response = await request(app.getHttpServer())
      .get('/balances/emp-bad/loc-bad/history?reason=INVALID_REASON')
      .expect(400);

    expect(response.body.message).toContain('Invalid audit reason');
  });
});
