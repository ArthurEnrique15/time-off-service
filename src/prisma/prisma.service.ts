import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { EnvConfigService } from '@shared/config/env';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(envConfigService: EnvConfigService) {
    super({
      datasources: {
        db: {
          url: envConfigService.get('database.url'),
        },
      },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async checkConnection(): Promise<boolean> {
    try {
      await this.$queryRawUnsafe('SELECT 1');

      return true;
    } catch {
      return false;
    }
  }
}
