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
      await prisma.$executeRawUnsafe(
        `INSERT INTO TimeOffRequest (id, employeeId, locationId, startDate, endDate, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        'sort-req-1',
        'emp-sort',
        'loc-sort',
        '2026-06-01T00:00:00.000Z',
        '2026-06-02T00:00:00.000Z',
        'PENDING',
        '2026-01-01T10:00:00.000Z',
        '2026-01-01T10:00:00.000Z',
      );

      await prisma.$executeRawUnsafe(
        `INSERT INTO TimeOffRequest (id, employeeId, locationId, startDate, endDate, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        'sort-req-2',
        'emp-sort',
        'loc-sort',
        '2026-07-01T00:00:00.000Z',
        '2026-07-02T00:00:00.000Z',
        'PENDING',
        '2026-01-02T10:00:00.000Z',
        '2026-01-02T10:00:00.000Z',
      );

      const response = await request(app.getHttpServer())
        .get('/time-off-requests?employeeId=emp-sort')
        .expect(200);

      expect(response.body.data[0].id).toBe('sort-req-2');
      expect(response.body.data[1].id).toBe('sort-req-1');
    });

    it('respects pagination params', async () => {
      await prisma.timeOffRequest.createMany({
        data: [
          { employeeId: 'emp-page', locationId: 'loc-page', startDate: new Date('2026-06-01'), endDate: new Date('2026-06-01'), status: 'PENDING' },
          { employeeId: 'emp-page', locationId: 'loc-page', startDate: new Date('2026-07-01'), endDate: new Date('2026-07-01'), status: 'PENDING' },
          { employeeId: 'emp-page', locationId: 'loc-page', startDate: new Date('2026-08-01'), endDate: new Date('2026-08-01'), status: 'PENDING' },
        ],
      });

      const page1 = await request(app.getHttpServer())
        .get('/time-off-requests?employeeId=emp-page&page=1&limit=2')
        .expect(200);

      expect(page1.body.data).toHaveLength(2);
      expect(page1.body.pagination.total).toBe(3);
      expect(page1.body.pagination.totalPages).toBe(2);
      expect(page1.body.pagination.limit).toBe(2);

      const page2 = await request(app.getHttpServer())
        .get('/time-off-requests?employeeId=emp-page&page=2&limit=2')
        .expect(200);

      expect(page2.body.data).toHaveLength(1);
      expect(page2.body.pagination.page).toBe(2);
    });

    it('clamps page=0 to page=1', async () => {
      const response = await request(app.getHttpServer())
        .get('/time-off-requests?employeeId=emp-no-requests&page=0')
        .expect(200);

      expect(response.body.pagination.page).toBe(1);
    });

    it('defaults page to 1 when non-numeric', async () => {
      const response = await request(app.getHttpServer())
        .get('/time-off-requests?employeeId=emp-no-requests&page=abc')
        .expect(200);

      expect(response.body.pagination.page).toBe(1);
    });
  });
});
