import { Module } from '@nestjs/common';

import { CustomHttpModule } from '@shared/core/custom-http';
import { EnvConfigModule } from '@shared/config/env';

import { HcmClient } from './hcm.client';

@Module({
  imports: [CustomHttpModule, EnvConfigModule],
  providers: [HcmClient],
  exports: [HcmClient],
})
export class HcmModule {}
