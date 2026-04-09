import { EnvConfigService, type EnvConfig } from '@shared/config/env';

describe('EnvConfigService', () => {
  it('returns nested values using typed paths', () => {
    const config = {
      port: 3000,
      nodeEnv: 'test',
      database: {
        url: 'file:./test.db',
      },
      hcm: {
        apiBaseUrl: 'http://127.0.0.1:4010',
        timeoutMs: 1500,
      },
    } satisfies EnvConfig;

    const service = new EnvConfigService({
      get: jest.fn((key: string) =>
        key.split('.').reduce<unknown>((value, segment) => (value as Record<string, unknown>)[segment], config),
      ),
    } as never);

    expect(service.get('database.url')).toBe('file:./test.db');
    expect(service.get('hcm.timeoutMs')).toBe(1500);
  });
});
