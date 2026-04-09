import type { INestApplication } from '@nestjs/common';
import { execSync } from 'node:child_process';
import request from 'supertest';

import type { BalanceService } from '../../src/core/services/balance.service';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { startMockHcmServer } from '../support/mock-hcm-server';
import { setTestEnvironment } from '../support/test-env';

describe('Balance management integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let balanceService: BalanceService;
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
    const { BalanceService: BalanceServiceClass } = await import('../../src/core/services/balance.service');
    const { Test } = await import('@nestjs/testing');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();

    await app.init();

    prisma = moduleRef.get(PrismaServiceClass);
    balanceService = moduleRef.get(BalanceServiceClass);
  });

  afterAll(async () => {
    await app.close();
    await closeMockHcm();
    cleanup();
  });

  describe('GET /balances', () => {
    it('returns an empty array when no balances exist for the employee', async () => {
      const response = await request(app.getHttpServer())
        .get('/balances')
        .query({ employeeId: 'emp-nonexistent' })
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('returns balances for the given employee', async () => {
      await prisma.balance.create({
        data: {
          employeeId: 'emp-list',
          locationId: 'loc-a',
          availableDays: 10,
        },
      });

      await prisma.balance.create({
        data: {
          employeeId: 'emp-list',
          locationId: 'loc-b',
          availableDays: 15,
        },
      });

      const response = await request(app.getHttpServer())
        .get('/balances')
        .query({ employeeId: 'emp-list' })
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body[0].employeeId).toBe('emp-list');
      expect(response.body[1].employeeId).toBe('emp-list');
    });
  });

  describe('GET /balances/:employeeId/:locationId', () => {
    it('returns the balance for the given employee and location', async () => {
      await prisma.balance.create({
        data: {
          employeeId: 'emp-get',
          locationId: 'loc-get',
          availableDays: 25,
          reservedDays: 3,
        },
      });

      const response = await request(app.getHttpServer()).get('/balances/emp-get/loc-get').expect(200);

      expect(response.body.employeeId).toBe('emp-get');
      expect(response.body.locationId).toBe('loc-get');
      expect(response.body.availableDays).toBe(25);
      expect(response.body.reservedDays).toBe(3);
    });

    it('returns 404 when the balance does not exist', async () => {
      await request(app.getHttpServer()).get('/balances/emp-missing/loc-missing').expect(404);
    });
  });

  describe('BalanceService internal methods', () => {
    it('reserve reduces available and increases reserved', async () => {
      await prisma.balance.create({
        data: {
          employeeId: 'emp-reserve',
          locationId: 'loc-reserve',
          availableDays: 20,
          reservedDays: 0,
        },
      });

      const updated = await balanceService.reserve('emp-reserve', 'loc-reserve', 5);

      expect(updated.availableDays).toBe(15);
      expect(updated.reservedDays).toBe(5);
    });

    it('reserve throws on insufficient balance', async () => {
      await prisma.balance.create({
        data: {
          employeeId: 'emp-reserve-fail',
          locationId: 'loc-reserve-fail',
          availableDays: 2,
          reservedDays: 0,
        },
      });

      await expect(balanceService.reserve('emp-reserve-fail', 'loc-reserve-fail', 10)).rejects.toThrow();
    });

    it('releaseReservation reverses a reservation', async () => {
      await prisma.balance.create({
        data: {
          employeeId: 'emp-release',
          locationId: 'loc-release',
          availableDays: 10,
          reservedDays: 5,
        },
      });

      const updated = await balanceService.releaseReservation('emp-release', 'loc-release', 3);

      expect(updated.availableDays).toBe(13);
      expect(updated.reservedDays).toBe(2);
    });

    it('confirmDeduction permanently deducts reserved days', async () => {
      await prisma.balance.create({
        data: {
          employeeId: 'emp-deduct',
          locationId: 'loc-deduct',
          availableDays: 10,
          reservedDays: 5,
        },
      });

      const updated = await balanceService.confirmDeduction('emp-deduct', 'loc-deduct', 3);

      expect(updated.availableDays).toBe(10);
      expect(updated.reservedDays).toBe(2);
    });

    it('restoreBalance increases available days', async () => {
      await prisma.balance.create({
        data: {
          employeeId: 'emp-restore',
          locationId: 'loc-restore',
          availableDays: 10,
          reservedDays: 0,
        },
      });

      const updated = await balanceService.restoreBalance('emp-restore', 'loc-restore', 5);

      expect(updated.availableDays).toBe(15);
    });

    it('setAvailableDays overwrites the available days', async () => {
      await prisma.balance.create({
        data: {
          employeeId: 'emp-set',
          locationId: 'loc-set',
          availableDays: 10,
          reservedDays: 0,
        },
      });

      const updated = await balanceService.setAvailableDays('emp-set', 'loc-set', 30);

      expect(updated.availableDays).toBe(30);
    });
  });
});
