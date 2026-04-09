import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_PIPE } from '@nestjs/core';

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
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false }),
    },
  ],
})
export class AppModule {}
