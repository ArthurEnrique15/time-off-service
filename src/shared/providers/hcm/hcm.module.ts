import { Module } from '@nestjs/common';

import { EnvConfigModule } from '@shared/config/env';
import { CustomHttpModule } from '@shared/core/custom-http';

import { HcmClient } from './hcm.client';

@Module({
  imports: [CustomHttpModule, EnvConfigModule],
  providers: [HcmClient],
  exports: [HcmClient],
})
export class HcmModule {}
