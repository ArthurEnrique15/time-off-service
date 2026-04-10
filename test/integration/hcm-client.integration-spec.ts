import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import type { HcmClient } from '../../src/shared/providers/hcm/hcm.client';
import { startMockHcmServer } from '../support/mock-hcm-server';
import { setTestEnvironment } from '../support/test-env';

describe('HcmClient integration', () => {
  let app: INestApplication;
  let cleanup: () => void;
  let closeMockHcm: () => Promise<void>;
  let hcmClient: HcmClient;

  beforeAll(async () => {
    const mockHcmServer = await startMockHcmServer({
      balances: [
        { employeeId: 'emp-1', locationId: 'loc-1', availableDays: 20 },
        { employeeId: 'emp-2', locationId: 'loc-2', availableDays: 1 },
      ],
      requests: [
        {
          id: 'existing-req-1',
          employeeId: 'emp-1',
          locationId: 'loc-1',
          startDate: '2026-03-01',
          endDate: '2026-03-02',
        },
      ],
    });

    const testEnvironment = setTestEnvironment({
      hcmBaseUrl: mockHcmServer.baseUrl,
    });

    cleanup = testEnvironment.cleanup;
    closeMockHcm = mockHcmServer.close;

    jest.resetModules();

    const { AppModule } = await import('../../src/app.module');
    const { HcmClient } = await import('../../src/shared/providers/hcm/hcm.client');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    hcmClient = moduleRef.get(HcmClient);
  });

  afterAll(async () => {
    await app.close();
    await closeMockHcm();
    cleanup();
  });

  describe('checkConnection', () => {
    it('returns true when the mock HCM server is running', async () => {
      await expect(hcmClient.checkConnection()).resolves.toBe(true);
    });
  });

  describe('getBalance', () => {
    it('returns Success with balance data for a valid employee+location', async () => {
      const result = await hcmClient.getBalance('emp-1', 'loc-1');

      expect(result.isSuccess()).toBe(true);

      if (result.isSuccess()) {
        expect(result.value).toEqual({
          employeeId: 'emp-1',
          locationId: 'loc-1',
          availableDays: 20,
        });
      }
    });

    it('returns Failure with INVALID_DIMENSIONS for an unknown combination', async () => {
      const result = await hcmClient.getBalance('emp-unknown', 'loc-unknown');

      expect(result.isFailure()).toBe(true);

      if (result.isFailure()) {
        expect(result.value.code).toBe('INVALID_DIMENSIONS');
      }
    });
  });

  describe('submitTimeOff', () => {
    it('returns Success when the employee has sufficient balance', async () => {
      const result = await hcmClient.submitTimeOff({
        employeeId: 'emp-1',
        locationId: 'loc-1',
        startDate: '2026-06-01',
        endDate: '2026-06-02',
      });

      expect(result.isSuccess()).toBe(true);

      if (result.isSuccess()) {
        expect(result.value.id).toBeDefined();
        expect(result.value.status).toBe('APPROVED');
      }
    });

    it('returns Failure with INSUFFICIENT_BALANCE when days exceed available', async () => {
      const result = await hcmClient.submitTimeOff({
        employeeId: 'emp-2',
        locationId: 'loc-2',
        startDate: '2026-06-01',
        endDate: '2026-06-10',
      });

      expect(result.isFailure()).toBe(true);

      if (result.isFailure()) {
        expect(result.value.code).toBe('INSUFFICIENT_BALANCE');
      }
    });

    it('returns Failure with INVALID_DIMENSIONS for an unknown employee+location', async () => {
      const result = await hcmClient.submitTimeOff({
        employeeId: 'emp-unknown',
        locationId: 'loc-unknown',
        startDate: '2026-06-01',
        endDate: '2026-06-02',
      });

      expect(result.isFailure()).toBe(true);

      if (result.isFailure()) {
        expect(result.value.code).toBe('INVALID_DIMENSIONS');
      }
    });
  });

  describe('cancelTimeOff', () => {
    it('returns Success when cancelling an existing request', async () => {
      const result = await hcmClient.cancelTimeOff('existing-req-1');

      expect(result.isSuccess()).toBe(true);
    });

    it('returns Failure with NOT_FOUND for a non-existent request', async () => {
      const result = await hcmClient.cancelTimeOff('non-existent-req');

      expect(result.isFailure()).toBe(true);

      if (result.isFailure()) {
        expect(result.value.code).toBe('NOT_FOUND');
      }
    });

    it('restores balance after cancelling a request', async () => {
      const balanceBefore = await hcmClient.getBalance('emp-2', 'loc-2');

      expect(balanceBefore.isSuccess()).toBe(true);
      if (balanceBefore.isFailure()) {
        throw new Error('Expected initial balance lookup to succeed');
      }
      const daysBefore = balanceBefore.value.availableDays;

      const submitResult = await hcmClient.submitTimeOff({
        employeeId: 'emp-2',
        locationId: 'loc-2',
        startDate: '2026-07-01',
        endDate: '2026-07-01',
      });

      expect(submitResult.isSuccess()).toBe(true);
      if (submitResult.isFailure()) {
        throw new Error('Expected submitTimeOff to succeed');
      }

      const cancelResult = await hcmClient.cancelTimeOff(submitResult.value.id);

      expect(cancelResult.isSuccess()).toBe(true);

      const balanceAfter = await hcmClient.getBalance('emp-2', 'loc-2');

      expect(balanceAfter.isSuccess()).toBe(true);
      if (balanceAfter.isFailure()) {
        throw new Error('Expected final balance lookup to succeed');
      }
      expect(balanceAfter.value.availableDays).toBe(daysBefore);
    });
  });
});
