import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type SetTestEnvironmentInput = {
  hcmBaseUrl: string;
};

export const setTestEnvironment = ({ hcmBaseUrl }: SetTestEnvironmentInput) => {
  const tempDirectory = mkdtempSync(join(tmpdir(), 'time-off-service-'));

  process.env.NODE_ENV = 'test';
  process.env.PORT = '0';
  process.env.DATABASE_URL = `file:${join(tempDirectory, 'integration.sqlite')}`;
  process.env.HCM_API_BASE_URL = hcmBaseUrl;
  process.env.HCM_TIMEOUT_MS = '1500';

  return {
    cleanup: () => {
      rmSync(tempDirectory, { recursive: true, force: true });
    },
  };
};
