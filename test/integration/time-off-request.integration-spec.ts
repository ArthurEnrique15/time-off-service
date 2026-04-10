import type { INestApplication } from '@nestjs/common';
import { execSync } from 'node:child_process';
import request from 'supertest';

import type { PrismaService } from '../../src/prisma/prisma.service';
import { startMockHcmServer } from '../support/mock-hcm-server';
import { setTestEnvironment } from '../support/test-env';

describe('Time-off request integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cleanup: () => void;
  let closeMockHcm: () => Promise<void>;
  let mockHcmHandlers: any;

  const EMPLOYEE_ID = 'emp-f5';
  const LOCATION_ID = 'loc-f5';

  beforeAll(async () => {
    const mockHcmServer = await startMockHcmServer({
      balances: [
        { employeeId: EMPLOYEE_ID, locationId: LOCATION_ID, availableDays: 1000 },
        { employeeId: EMPLOYEE_ID, locationId: 'loc-hcm-low', availableDays: 1 },
      ],
    });
    const testEnvironment = setTestEnvironment({ hcmBaseUrl: mockHcmServer.baseUrl });

    cleanup = testEnvironment.cleanup;
    closeMockHcm = mockHcmServer.close;
    mockHcmHandlers = mockHcmServer.handlers;

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

    await prisma.balance.create({
      data: { employeeId: EMPLOYEE_ID, locationId: LOCATION_ID, availableDays: 20 },
    });
  });

  afterEach(async () => {
    mockHcmHandlers.submitTimeOff = undefined;
    await prisma.balanceAuditEntry.deleteMany({});
    await prisma.timeOffRequest.deleteMany({});
    await prisma.balance.deleteMany({
      where: {
        employeeId: EMPLOYEE_ID,
        locationId: { in: ['loc-unknown-in-hcm', 'loc-hcm-low', 'loc-hcm-down'] },
      },
    });
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
      expect(response.body.hcmRequestId).toBeNull();
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
      expect(record!.hcmRequestId).toBeNull();
    });

    it('decrements availableDays and increments reservedDays on the balance', async () => {
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
      expect(auditEntries[0].requestId).not.toBeNull();
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
          endDate: '2025-06-05',
        })
        .expect(400);
    });

    it('does not modify the balance when local balance is insufficient', async () => {
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
          endDate: '2025-06-05',
        })
        .expect(400);

      const balance = await prisma.balance.findUnique({
        where: { employeeId_locationId: { employeeId: EMPLOYEE_ID, locationId: LOCATION_ID } },
      });

      expect(balance!.availableDays).toBe(1);
      expect(balance!.reservedDays).toBe(0);
    });

    it('returns 201 for a single-day request (startDate equals endDate)', async () => {
      const response = await request(app.getHttpServer())
        .post('/time-off-requests')
        .send({
          employeeId: EMPLOYEE_ID,
          locationId: LOCATION_ID,
          startDate: '2025-07-01',
          endDate: '2025-07-01',
        })
        .expect(201);

      expect(response.body.status).toBe('PENDING');

      const balance = await prisma.balance.findUnique({
        where: { employeeId_locationId: { employeeId: EMPLOYEE_ID, locationId: LOCATION_ID } },
      });

      expect(balance!.availableDays).toBe(19);
      expect(balance!.reservedDays).toBe(1);
    });

    describe('when HCM would reject during later approval', () => {
      beforeEach(async () => {
        await prisma.balance.createMany({
          data: [
            { employeeId: EMPLOYEE_ID, locationId: 'loc-unknown-in-hcm', availableDays: 20 },
            { employeeId: EMPLOYEE_ID, locationId: 'loc-hcm-low', availableDays: 20 },
          ],
        });
      });

      it('still creates a pending request when the location is unknown to HCM', async () => {
        const response = await request(app.getHttpServer())
          .post('/time-off-requests')
          .send({
            employeeId: EMPLOYEE_ID,
            locationId: 'loc-unknown-in-hcm',
            startDate: '2025-06-01',
            endDate: '2025-06-05',
          })
          .expect(201);

        expect(response.body.status).toBe('PENDING');
        expect(response.body.hcmRequestId).toBeNull();
      });

      it('still creates a pending request when HCM would later reject for insufficient balance', async () => {
        const response = await request(app.getHttpServer())
          .post('/time-off-requests')
          .send({
            employeeId: EMPLOYEE_ID,
            locationId: 'loc-hcm-low',
            startDate: '2025-06-01',
            endDate: '2025-06-05',
          })
          .expect(201);

        const record = await prisma.timeOffRequest.findFirst({
          where: { id: response.body.id },
        });

        expect(record).not.toBeNull();
        expect(record!.status).toBe('PENDING');
        expect(record!.hcmRequestId).toBeNull();
      });
    });
  });

  describe('GET /time-off-requests/:id', () => {
    it('returns 404 for unknown id', async () => {
      const response = await request(app.getHttpServer()).get('/time-off-requests/nonexistent-id').expect(404);

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

      const response = await request(app.getHttpServer()).get(`/time-off-requests/${created.id}`).expect(200);

      expect(response.body.id).toBe(created.id);
      expect(response.body.employeeId).toBe('emp-get-one');
      expect(response.body.status).toBe('PENDING');
    });
  });

  describe('GET /time-off-requests', () => {
    it('returns 400 when employeeId is missing', async () => {
      await request(app.getHttpServer()).get('/time-off-requests').expect(400);
    });

    it('returns 400 for invalid status value', async () => {
      await request(app.getHttpServer()).get('/time-off-requests?employeeId=emp-1&status=INVALID').expect(400);
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

      const response = await request(app.getHttpServer()).get('/time-off-requests?employeeId=emp-list').expect(200);

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

      const response = await request(app.getHttpServer()).get('/time-off-requests?employeeId=emp-sort').expect(200);

      expect(response.body.data[0].id).toBe('sort-req-2');
      expect(response.body.data[1].id).toBe('sort-req-1');
    });

    it('respects pagination params', async () => {
      await prisma.timeOffRequest.createMany({
        data: [
          {
            employeeId: 'emp-page',
            locationId: 'loc-page',
            startDate: new Date('2026-06-01'),
            endDate: new Date('2026-06-01'),
            status: 'PENDING',
          },
          {
            employeeId: 'emp-page',
            locationId: 'loc-page',
            startDate: new Date('2026-07-01'),
            endDate: new Date('2026-07-01'),
            status: 'PENDING',
          },
          {
            employeeId: 'emp-page',
            locationId: 'loc-page',
            startDate: new Date('2026-08-01'),
            endDate: new Date('2026-08-01'),
            status: 'PENDING',
          },
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

  describe('PATCH /time-off-requests/:id/approve', () => {
    it('returns 200 with status APPROVED on a PENDING request', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/time-off-requests')
        .send({ employeeId: EMPLOYEE_ID, locationId: LOCATION_ID, startDate: '2025-08-01', endDate: '2025-08-05' })
        .expect(201);

      expect(createRes.body.hcmRequestId).toBeNull();

      const response = await request(app.getHttpServer())
        .patch(`/time-off-requests/${createRes.body.id}/approve`)
        .expect(200);

      expect(response.body.status).toBe('APPROVED');
      expect(response.body.id).toBe(createRes.body.id);
      expect(response.body.hcmRequestId).toBeTruthy();
    });

    it('decrements reservedDays (removes the reservation) on approve', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/time-off-requests')
        .send({ employeeId: EMPLOYEE_ID, locationId: LOCATION_ID, startDate: '2025-08-01', endDate: '2025-08-05' })
        .expect(201);

      await request(app.getHttpServer()).patch(`/time-off-requests/${createRes.body.id}/approve`).expect(200);

      const balance = await prisma.balance.findUnique({
        where: { employeeId_locationId: { employeeId: EMPLOYEE_ID, locationId: LOCATION_ID } },
      });

      // 5 days reserved on create, 0 reserved after approve (confirmDeduction)
      expect(balance!.reservedDays).toBe(0);
      // availableDays unchanged by approve (was already decremented on create)
      expect(balance!.availableDays).toBe(15);
    });

    it('records an APPROVAL_DEDUCTION audit entry with negative delta', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/time-off-requests')
        .send({ employeeId: EMPLOYEE_ID, locationId: LOCATION_ID, startDate: '2025-08-01', endDate: '2025-08-05' })
        .expect(201);

      await request(app.getHttpServer()).patch(`/time-off-requests/${createRes.body.id}/approve`).expect(200);

      const balance = await prisma.balance.findUnique({
        where: { employeeId_locationId: { employeeId: EMPLOYEE_ID, locationId: LOCATION_ID } },
      });

      const auditEntries = await prisma.balanceAuditEntry.findMany({
        where: { balanceId: balance!.id, reason: 'APPROVAL_DEDUCTION' },
      });

      expect(auditEntries).toHaveLength(1);
      expect(auditEntries[0].delta).toBe(-5);
      expect(auditEntries[0].requestId).toBe(createRes.body.id);
    });

    it('records an HCM_SYNC audit entry on approval success', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/time-off-requests')
        .send({ employeeId: EMPLOYEE_ID, locationId: LOCATION_ID, startDate: '2025-08-01', endDate: '2025-08-05' })
        .expect(201);

      await request(app.getHttpServer()).patch(`/time-off-requests/${createRes.body.id}/approve`).expect(200);

      const balance = await prisma.balance.findUnique({
        where: { employeeId_locationId: { employeeId: EMPLOYEE_ID, locationId: LOCATION_ID } },
      });

      const auditEntry = await prisma.balanceAuditEntry.findFirst({
        where: { balanceId: balance!.id, reason: 'HCM_SYNC' },
      });

      expect(auditEntry).not.toBeNull();
      expect(auditEntry!.delta).toBe(0);
      expect(auditEntry!.reference).toContain('operation=approve');
      expect(auditEntry!.reference).toContain('outcome=success');
    });

    it('records actorId in the audit entry when provided', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/time-off-requests')
        .send({ employeeId: EMPLOYEE_ID, locationId: LOCATION_ID, startDate: '2025-08-01', endDate: '2025-08-05' })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/time-off-requests/${createRes.body.id}/approve`)
        .send({ actorId: 'manager-1' })
        .expect(200);

      const balance = await prisma.balance.findUnique({
        where: { employeeId_locationId: { employeeId: EMPLOYEE_ID, locationId: LOCATION_ID } },
      });

      const auditEntry = await prisma.balanceAuditEntry.findFirst({
        where: { balanceId: balance!.id, reason: 'APPROVAL_DEDUCTION' },
      });

      expect(auditEntry!.actorId).toBe('manager-1');
    });

    it('returns 404 when request does not exist', async () => {
      await request(app.getHttpServer()).patch('/time-off-requests/non-existent-id/approve').expect(404);
    });

    it('returns 409 when request is already APPROVED', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/time-off-requests')
        .send({ employeeId: EMPLOYEE_ID, locationId: LOCATION_ID, startDate: '2025-08-01', endDate: '2025-08-05' })
        .expect(201);

      await request(app.getHttpServer()).patch(`/time-off-requests/${createRes.body.id}/approve`).expect(200);

      await request(app.getHttpServer()).patch(`/time-off-requests/${createRes.body.id}/approve`).expect(409);
    });

    it('returns 409 when request is REJECTED', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/time-off-requests')
        .send({ employeeId: EMPLOYEE_ID, locationId: LOCATION_ID, startDate: '2025-08-01', endDate: '2025-08-05' })
        .expect(201);

      await request(app.getHttpServer()).patch(`/time-off-requests/${createRes.body.id}/reject`).expect(200);

      await request(app.getHttpServer()).patch(`/time-off-requests/${createRes.body.id}/approve`).expect(409);
    });

    describe('when HCM rejects the approval with INVALID_DIMENSIONS', () => {
      beforeEach(async () => {
        await prisma.balance.create({
          data: { employeeId: EMPLOYEE_ID, locationId: 'loc-unknown-in-hcm', availableDays: 20 },
        });
      });

      it('returns 422, marks the request REJECTED, and releases the reservation', async () => {
        const createRes = await request(app.getHttpServer())
          .post('/time-off-requests')
          .send({
            employeeId: EMPLOYEE_ID,
            locationId: 'loc-unknown-in-hcm',
            startDate: '2025-08-01',
            endDate: '2025-08-05',
          })
          .expect(201);

        await request(app.getHttpServer()).patch(`/time-off-requests/${createRes.body.id}/approve`).expect(422);

        const record = await prisma.timeOffRequest.findUnique({ where: { id: createRes.body.id } });
        const balance = await prisma.balance.findUnique({
          where: { employeeId_locationId: { employeeId: EMPLOYEE_ID, locationId: 'loc-unknown-in-hcm' } },
        });

        expect(record!.status).toBe('REJECTED');
        expect(record!.hcmRequestId).toBeNull();
        expect(balance!.availableDays).toBe(20);
        expect(balance!.reservedDays).toBe(0);
      });
    });

    describe('when HCM rejects the approval with INSUFFICIENT_BALANCE', () => {
      beforeEach(async () => {
        await prisma.balance.create({
          data: { employeeId: EMPLOYEE_ID, locationId: 'loc-hcm-low', availableDays: 20 },
        });
      });

      it('returns 400, marks the request REJECTED, and records rejection sync audit data', async () => {
        const createRes = await request(app.getHttpServer())
          .post('/time-off-requests')
          .send({
            employeeId: EMPLOYEE_ID,
            locationId: 'loc-hcm-low',
            startDate: '2025-08-01',
            endDate: '2025-08-05',
          })
          .expect(201);

        await request(app.getHttpServer()).patch(`/time-off-requests/${createRes.body.id}/approve`).expect(400);

        const record = await prisma.timeOffRequest.findUnique({ where: { id: createRes.body.id } });
        const balance = await prisma.balance.findUnique({
          where: { employeeId_locationId: { employeeId: EMPLOYEE_ID, locationId: 'loc-hcm-low' } },
        });
        const auditEntries = await prisma.balanceAuditEntry.findMany({
          where: { balanceId: balance!.id },
          orderBy: { createdAt: 'asc' },
        });

        expect(record!.status).toBe('REJECTED');
        expect(record!.hcmRequestId).toBeNull();
        expect(balance!.availableDays).toBe(20);
        expect(balance!.reservedDays).toBe(0);
        expect(auditEntries.map((entry) => entry.reason)).toEqual(['RESERVATION', 'RESERVATION_RELEASE', 'HCM_SYNC']);
      });
    });

    describe('when HCM is unavailable during approval', () => {
      beforeEach(async () => {
        await prisma.balance.create({
          data: { employeeId: EMPLOYEE_ID, locationId: 'loc-hcm-down', availableDays: 20 },
        });
        mockHcmHandlers.submitTimeOff = (body: any) =>
          body.locationId === 'loc-hcm-down'
            ? {
                statusCode: 500,
                body: { message: 'downstream unavailable' },
              }
            : undefined;
      });

      it('returns 503, keeps the request PENDING, and keeps the reservation intact', async () => {
        const createRes = await request(app.getHttpServer())
          .post('/time-off-requests')
          .send({
            employeeId: EMPLOYEE_ID,
            locationId: 'loc-hcm-down',
            startDate: '2025-08-01',
            endDate: '2025-08-05',
          })
          .expect(201);

        await request(app.getHttpServer()).patch(`/time-off-requests/${createRes.body.id}/approve`).expect(503);

        const record = await prisma.timeOffRequest.findUnique({ where: { id: createRes.body.id } });
        const balance = await prisma.balance.findUnique({
          where: { employeeId_locationId: { employeeId: EMPLOYEE_ID, locationId: 'loc-hcm-down' } },
        });
        const syncEntry = await prisma.balanceAuditEntry.findFirst({
          where: { balanceId: balance!.id, reason: 'HCM_SYNC' },
        });

        expect(record!.status).toBe('PENDING');
        expect(record!.hcmRequestId).toBeNull();
        expect(balance!.availableDays).toBe(15);
        expect(balance!.reservedDays).toBe(5);
        expect(syncEntry).not.toBeNull();
        expect(syncEntry!.reference).toContain('code=UNKNOWN');
      });
    });
  });

  describe('PATCH /time-off-requests/:id/reject', () => {
    it('returns 200 with status REJECTED on a PENDING request', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/time-off-requests')
        .send({ employeeId: EMPLOYEE_ID, locationId: LOCATION_ID, startDate: '2025-08-01', endDate: '2025-08-05' })
        .expect(201);

      const response = await request(app.getHttpServer())
        .patch(`/time-off-requests/${createRes.body.id}/reject`)
        .expect(200);

      expect(response.body.status).toBe('REJECTED');
      expect(response.body.id).toBe(createRes.body.id);
    });

    it('restores availableDays and clears reservedDays on reject', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/time-off-requests')
        .send({ employeeId: EMPLOYEE_ID, locationId: LOCATION_ID, startDate: '2025-08-01', endDate: '2025-08-05' })
        .expect(201);

      await request(app.getHttpServer()).patch(`/time-off-requests/${createRes.body.id}/reject`).expect(200);

      const balance = await prisma.balance.findUnique({
        where: { employeeId_locationId: { employeeId: EMPLOYEE_ID, locationId: LOCATION_ID } },
      });

      expect(balance!.reservedDays).toBe(0);
      expect(balance!.availableDays).toBe(20);
    });

    it('records a RESERVATION_RELEASE audit entry with positive delta', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/time-off-requests')
        .send({ employeeId: EMPLOYEE_ID, locationId: LOCATION_ID, startDate: '2025-08-01', endDate: '2025-08-05' })
        .expect(201);

      await request(app.getHttpServer()).patch(`/time-off-requests/${createRes.body.id}/reject`).expect(200);

      const balance = await prisma.balance.findUnique({
        where: { employeeId_locationId: { employeeId: EMPLOYEE_ID, locationId: LOCATION_ID } },
      });

      const auditEntries = await prisma.balanceAuditEntry.findMany({
        where: { balanceId: balance!.id, reason: 'RESERVATION_RELEASE' },
      });

      expect(auditEntries).toHaveLength(1);
      expect(auditEntries[0].delta).toBe(5);
      expect(auditEntries[0].requestId).toBe(createRes.body.id);
    });

    it('returns 404 when request does not exist', async () => {
      await request(app.getHttpServer()).patch('/time-off-requests/non-existent-id/reject').expect(404);
    });

    it('records actorId in the audit entry when provided', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/time-off-requests')
        .send({ employeeId: EMPLOYEE_ID, locationId: LOCATION_ID, startDate: '2025-08-01', endDate: '2025-08-05' })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/time-off-requests/${createRes.body.id}/reject`)
        .send({ actorId: 'manager-2' })
        .expect(200);

      const balance = await prisma.balance.findUnique({
        where: { employeeId_locationId: { employeeId: EMPLOYEE_ID, locationId: LOCATION_ID } },
      });

      const auditEntry = await prisma.balanceAuditEntry.findFirst({
        where: { balanceId: balance!.id, reason: 'RESERVATION_RELEASE' },
      });

      expect(auditEntry!.actorId).toBe('manager-2');
    });

    it('returns 409 when request is already REJECTED', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/time-off-requests')
        .send({ employeeId: EMPLOYEE_ID, locationId: LOCATION_ID, startDate: '2025-08-01', endDate: '2025-08-05' })
        .expect(201);

      await request(app.getHttpServer()).patch(`/time-off-requests/${createRes.body.id}/reject`).expect(200);

      await request(app.getHttpServer()).patch(`/time-off-requests/${createRes.body.id}/reject`).expect(409);
    });
  });
});
