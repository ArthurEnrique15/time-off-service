import type { EnvConfigService } from '@shared/config/env';
import { HcmClient } from '@shared/providers/hcm/hcm.client';

describe('HcmClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  const createService = (): HcmClient => {
    const envConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'hcm.apiBaseUrl') {
          return 'http://127.0.0.1:4010';
        }

        if (key === 'hcm.timeoutMs') {
          return 1500;
        }

        throw new Error(`Unexpected key: ${key}`);
      }),
    } as unknown as EnvConfigService;

    return new HcmClient(envConfigService);
  };

  it('returns true when the upstream health endpoint responds successfully', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
    } as Response);

    const service = createService();

    await expect(service.checkConnection()).resolves.toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:4010/health',
      expect.objectContaining({
        method: 'GET',
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('returns false when the upstream health endpoint fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
    } as Response);

    const service = createService();

    await expect(service.checkConnection()).resolves.toBe(false);
  });

  it('returns false when the upstream request throws', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('connection refused'));

    const service = createService();

    await expect(service.checkConnection()).resolves.toBe(false);
  });
});
