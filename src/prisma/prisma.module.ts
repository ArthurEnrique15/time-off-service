import { Module } from '@nestjs/common';

import { EnvConfigModule } from '@shared/config/env';

import { PrismaService } from './prisma.service';

@Module({
  imports: [EnvConfigModule],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
