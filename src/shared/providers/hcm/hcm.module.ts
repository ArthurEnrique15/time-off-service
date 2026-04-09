import { Module } from '@nestjs/common';

import { EnvConfigModule } from '@shared/config/env';

import { HcmClient } from './hcm.client';

@Module({
  imports: [EnvConfigModule],
  providers: [HcmClient],
  exports: [HcmClient],
})
export class HcmModule {}
