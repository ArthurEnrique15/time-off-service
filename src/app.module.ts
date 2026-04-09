import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { TimeOffModule } from '@module/time-off.module';

import { EnvConfigModule, envValidationSchema, getEnvConfig } from '@shared/config/env';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [getEnvConfig],
      validationSchema: envValidationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: true,
      },
    }),
    EnvConfigModule,
    TimeOffModule,
  ],
})
export class AppModule {}
