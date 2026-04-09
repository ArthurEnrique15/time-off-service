import type { PrismaService } from '@app-prisma/prisma.service';

import { HealthService } from '@core/services/health.service';

import type { EnvConfigService } from '@shared/config/env';
import type { HcmClient } from '@shared/providers/hcm/hcm.client';

describe('HealthService', () => {
  const createService = (options?: { databaseUp?: boolean; hcmUp?: boolean }): HealthService => {
    const prismaService = {
      checkConnection: jest.fn().mockResolvedValue(options?.databaseUp ?? true),
    } as unknown as PrismaService;

    const hcmClient = {
      checkConnection: jest.fn().mockResolvedValue(options?.hcmUp ?? true),
    } as unknown as HcmClient;

    const envConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'nodeEnv') {
          return 'test';
        }

        throw new Error(`Unexpected key: ${key}`);
      }),
    } as unknown as EnvConfigService;

    return new HealthService(prismaService, hcmClient, envConfigService);
  };

  it('returns ok when all dependencies are reachable', async () => {
    const service = createService();

    await expect(service.getHealth()).resolves.toEqual({
      status: 'ok',
      environment: 'test',
      dependencies: {
        database: 'up',
        hcm: 'up',
      },
    });
  });

  it('returns degraded when one dependency is unavailable', async () => {
    const service = createService({ hcmUp: false });

    await expect(service.getHealth()).resolves.toEqual({
      status: 'degraded',
      environment: 'test',
      dependencies: {
        database: 'up',
        hcm: 'down',
      },
    });
  });

  it('returns degraded when the database dependency is unavailable', async () => {
    const service = createService({ databaseUp: false });

    await expect(service.getHealth()).resolves.toEqual({
      status: 'degraded',
      environment: 'test',
      dependencies: {
        database: 'down',
        hcm: 'up',
      },
    });
  });
});
