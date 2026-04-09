import { Injectable } from '@nestjs/common';

import { PrismaService } from '@app-prisma/prisma.service';

import { EnvConfigService } from '@shared/config/env';
import { HcmClient } from '@shared/providers/hcm/hcm.client';

export type HealthResponse = {
  status: 'ok' | 'degraded';
  environment: string;
  dependencies: {
    database: 'up' | 'down';
    hcm: 'up' | 'down';
  };
};

@Injectable()
export class HealthService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly hcmClient: HcmClient,
    private readonly envConfigService: EnvConfigService,
  ) {}

  async getHealth(): Promise<HealthResponse> {
    const [databaseUp, hcmUp] = await Promise.all([
      this.prismaService.checkConnection(),
      this.hcmClient.checkConnection(),
    ]);

    return {
      status: databaseUp && hcmUp ? 'ok' : 'degraded',
      environment: this.envConfigService.get('nodeEnv'),
      dependencies: {
        database: databaseUp ? 'up' : 'down',
        hcm: hcmUp ? 'up' : 'down',
      },
    };
  }
}
