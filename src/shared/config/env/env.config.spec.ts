import { getEnvConfig } from '@shared/config/env/env.config';
import { envValidationSchema } from '@shared/config/env/env.schema';

describe('env config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      PORT: '3000',
      DATABASE_URL: 'file:./test.db',
      HCM_API_BASE_URL: 'http://127.0.0.1:4010',
      HCM_TIMEOUT_MS: '1500',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('validates the required environment variables', () => {
    const result = envValidationSchema.validate(process.env);

    expect(result.error).toBeUndefined();
  });

  it('maps the current process environment into the typed config object', () => {
    expect(getEnvConfig()).toEqual({
      port: 3000,
      nodeEnv: 'test',
      database: {
        url: 'file:./test.db',
      },
      hcm: {
        apiBaseUrl: 'http://127.0.0.1:4010',
        timeoutMs: 1500,
      },
    });
  });

  it('uses fallback values when optional runtime defaults are needed', () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: '',
      PORT: '',
      DATABASE_URL: '',
      HCM_API_BASE_URL: '',
      HCM_TIMEOUT_MS: '',
    };

    expect(getEnvConfig()).toEqual({
      port: 80,
      nodeEnv: 'local',
      database: {
        url: '',
      },
      hcm: {
        apiBaseUrl: '',
        timeoutMs: 3000,
      },
    });
  });
});
