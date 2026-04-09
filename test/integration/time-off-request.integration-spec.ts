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
