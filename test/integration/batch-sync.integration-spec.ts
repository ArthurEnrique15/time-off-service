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
    const { ValidationPipe } = await import('@nestjs/common');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
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

      const updateEntry = history.body.data.find(
        (e: { reason: string; delta: number }) => e.reason === 'BATCH_SYNC' && e.delta === 10,
      );
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
