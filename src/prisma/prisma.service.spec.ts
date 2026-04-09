import { PrismaService } from '@app-prisma/prisma.service';

import type { EnvConfigService } from '@shared/config/env';

describe('PrismaService', () => {
  const createService = (): PrismaService => {
    const envConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'database.url') {
          return 'file:./test.db';
        }

        throw new Error(`Unexpected key: ${key}`);
      }),
    } as unknown as EnvConfigService;

    return new PrismaService(envConfigService);
  };

  it('connects and disconnects through the Nest lifecycle hooks', async () => {
    const service = createService();

    const connectSpy = jest.spyOn(service, '$connect').mockResolvedValue();
    const disconnectSpy = jest.spyOn(service, '$disconnect').mockResolvedValue();

    await service.onModuleInit();
    await service.onModuleDestroy();

    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });

  it('returns true when the database health query succeeds', async () => {
    const service = createService();

    jest.spyOn(service, '$queryRawUnsafe').mockResolvedValue([{ healthy: 1 }] as never);

    await expect(service.checkConnection()).resolves.toBe(true);
  });

  it('returns false when the database health query fails', async () => {
    const service = createService();

    jest.spyOn(service, '$queryRawUnsafe').mockRejectedValue(new Error('database offline'));

    await expect(service.checkConnection()).resolves.toBe(false);
  });
});
