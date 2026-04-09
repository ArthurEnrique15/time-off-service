import type { AxiosResponse } from 'axios';

import type { EnvConfigService } from '@shared/config/env';
import type { CustomHttpService } from '@shared/core/custom-http';

import { HcmClient } from './hcm.client';

describe('HcmClient', () => {
  const createClient = () => {
    const customHttpService = {
      request: jest.fn(),
    } as unknown as CustomHttpService;

    const envConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'hcm.apiBaseUrl') return 'http://127.0.0.1:4010';
        if (key === 'hcm.timeoutMs') return 1500;
        throw new Error(`Unexpected key: ${key}`);
      }),
    } as unknown as EnvConfigService;

    const client = new HcmClient(customHttpService, envConfigService);

    return { client, customHttpService, envConfigService };
  };

  const mockResponse = (overrides: Partial<AxiosResponse>): AxiosResponse => ({
    status: 200,
    data: {},
    statusText: 'OK',
    headers: {},
    config: {} as any,
    ...overrides,
  });

  describe('checkConnection', () => {
    it('returns true when the health endpoint responds with status 200', async () => {
      const { client, customHttpService } = createClient();

      (customHttpService.request as jest.Mock).mockResolvedValue(mockResponse({ status: 200, data: { status: 'ok' } }));

      await expect(client.checkConnection()).resolves.toBe(true);
      expect(customHttpService.request).toHaveBeenCalledWith({
        method: 'GET',
        url: 'http://127.0.0.1:4010/health',
        timeout: 1500,
      });
    });

    it('returns false when the health endpoint responds with a non-200 status', async () => {
      const { client, customHttpService } = createClient();

      (customHttpService.request as jest.Mock).mockResolvedValue(mockResponse({ status: 503 }));

      await expect(client.checkConnection()).resolves.toBe(false);
    });

    it('returns false when the request results in a normalized network error', async () => {
      const { client, customHttpService } = createClient();

      (customHttpService.request as jest.Mock).mockResolvedValue(
        mockResponse({ status: 500, data: { error: new Error('ECONNREFUSED') } }),
      );

      await expect(client.checkConnection()).resolves.toBe(false);
    });
  });

  describe('getBalance', () => {
    it('returns Success with balance data when HCM responds with 200', async () => {
      const { client, customHttpService } = createClient();
      const balanceData = { employeeId: 'emp-1', locationId: 'loc-1', availableDays: 15 };

      (customHttpService.request as jest.Mock).mockResolvedValue(mockResponse({ status: 200, data: balanceData }));

      const result = await client.getBalance('emp-1', 'loc-1');

      expect(result.isSuccess()).toBe(true);

      if (result.isSuccess()) {
        expect(result.value).toEqual(balanceData);
      }

      expect(customHttpService.request).toHaveBeenCalledWith({
        method: 'GET',
        url: 'http://127.0.0.1:4010/balances/emp-1/loc-1',
        timeout: 1500,
      });
    });

    it('returns Failure with INVALID_DIMENSIONS when HCM responds with 404', async () => {
      const { client, customHttpService } = createClient();

      (customHttpService.request as jest.Mock).mockResolvedValue(
        mockResponse({
          status: 404,
          data: { error: 'INVALID_DIMENSIONS', message: 'Unknown combination' },
        }),
      );

      const result = await client.getBalance('emp-x', 'loc-x');

      expect(result.isFailure()).toBe(true);

      if (result.isFailure()) {
        expect(result.value.code).toBe('INVALID_DIMENSIONS');
        expect(result.value.message).toBe('Unknown combination');
        expect(result.value.statusCode).toBe(404);
      }
    });

    it('returns Failure with UNKNOWN when HCM responds with an unexpected status', async () => {
      const { client, customHttpService } = createClient();

      (customHttpService.request as jest.Mock).mockResolvedValue(
        mockResponse({ status: 500, data: { error: new Error('timeout') } }),
      );

      const result = await client.getBalance('emp-1', 'loc-1');

      expect(result.isFailure()).toBe(true);

      if (result.isFailure()) {
        expect(result.value.code).toBe('UNKNOWN');
        expect(result.value.message).toBe('HCM responded with status 500');
        expect(result.value.statusCode).toBe(500);
      }
    });

    it('returns Failure with UNKNOWN when HCM responds with null data', async () => {
      const { client, customHttpService } = createClient();

      (customHttpService.request as jest.Mock).mockResolvedValue(mockResponse({ status: 502, data: null }));

      const result = await client.getBalance('emp-1', 'loc-1');

      expect(result.isFailure()).toBe(true);

      if (result.isFailure()) {
        expect(result.value.code).toBe('UNKNOWN');
        expect(result.value.message).toBe('HCM responded with status 502');
        expect(result.value.statusCode).toBe(502);
      }
    });
  });

  describe('submitTimeOff', () => {
    const submitRequest = {
      employeeId: 'emp-1',
      locationId: 'loc-1',
      startDate: '2026-05-01',
      endDate: '2026-05-03',
    };

    it('returns Success with submission data when HCM responds with 201', async () => {
      const { client, customHttpService } = createClient();
      const responseData = { id: 'hcm-req-1', status: 'APPROVED' };

      (customHttpService.request as jest.Mock).mockResolvedValue(mockResponse({ status: 201, data: responseData }));

      const result = await client.submitTimeOff(submitRequest);

      expect(result.isSuccess()).toBe(true);

      if (result.isSuccess()) {
        expect(result.value).toEqual(responseData);
      }

      expect(customHttpService.request).toHaveBeenCalledWith({
        method: 'POST',
        url: 'http://127.0.0.1:4010/time-off-requests',
        timeout: 1500,
        data: submitRequest,
      });
    });

    it('returns Failure with INSUFFICIENT_BALANCE when HCM responds with 400 and that error', async () => {
      const { client, customHttpService } = createClient();

      (customHttpService.request as jest.Mock).mockResolvedValue(
        mockResponse({
          status: 400,
          data: { error: 'INSUFFICIENT_BALANCE', message: 'Not enough days' },
        }),
      );

      const result = await client.submitTimeOff(submitRequest);

      expect(result.isFailure()).toBe(true);

      if (result.isFailure()) {
        expect(result.value.code).toBe('INSUFFICIENT_BALANCE');
        expect(result.value.statusCode).toBe(400);
      }
    });

    it('returns Failure with INVALID_DIMENSIONS when HCM responds with 400 and that error', async () => {
      const { client, customHttpService } = createClient();

      (customHttpService.request as jest.Mock).mockResolvedValue(
        mockResponse({
          status: 400,
          data: { error: 'INVALID_DIMENSIONS', message: 'Unknown combination' },
        }),
      );

      const result = await client.submitTimeOff(submitRequest);

      expect(result.isFailure()).toBe(true);

      if (result.isFailure()) {
        expect(result.value.code).toBe('INVALID_DIMENSIONS');
      }
    });

    it('returns Failure with UNKNOWN when HCM responds with an unexpected status', async () => {
      const { client, customHttpService } = createClient();

      (customHttpService.request as jest.Mock).mockResolvedValue(mockResponse({ status: 500, data: {} }));

      const result = await client.submitTimeOff(submitRequest);

      expect(result.isFailure()).toBe(true);

      if (result.isFailure()) {
        expect(result.value.code).toBe('UNKNOWN');
      }
    });
  });

  describe('cancelTimeOff', () => {
    it('returns Success with void when HCM responds with 204', async () => {
      const { client, customHttpService } = createClient();

      (customHttpService.request as jest.Mock).mockResolvedValue(mockResponse({ status: 204, data: null }));

      const result = await client.cancelTimeOff('hcm-req-1');

      expect(result.isSuccess()).toBe(true);
      expect(customHttpService.request).toHaveBeenCalledWith({
        method: 'DELETE',
        url: 'http://127.0.0.1:4010/time-off-requests/hcm-req-1',
        timeout: 1500,
      });
    });

    it('returns Failure with NOT_FOUND when HCM responds with 404', async () => {
      const { client, customHttpService } = createClient();

      (customHttpService.request as jest.Mock).mockResolvedValue(
        mockResponse({
          status: 404,
          data: { error: 'NOT_FOUND', message: 'Request not found' },
        }),
      );

      const result = await client.cancelTimeOff('hcm-req-x');

      expect(result.isFailure()).toBe(true);

      if (result.isFailure()) {
        expect(result.value.code).toBe('NOT_FOUND');
        expect(result.value.statusCode).toBe(404);
      }
    });

    it('returns Failure with UNKNOWN when HCM responds with an unexpected status', async () => {
      const { client, customHttpService } = createClient();

      (customHttpService.request as jest.Mock).mockResolvedValue(mockResponse({ status: 500, data: {} }));

      const result = await client.cancelTimeOff('hcm-req-1');

      expect(result.isFailure()).toBe(true);

      if (result.isFailure()) {
        expect(result.value.code).toBe('UNKNOWN');
      }
    });
  });
});
