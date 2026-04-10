import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { EnvConfigService } from '@shared/config/env';

import { AppModule } from './app.module';

export async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const envConfigService = app.get(EnvConfigService);
  const port = envConfigService.get('port');

  await app.listen(port);

  return app;
}

export function runForModule(
  currentMain: NodeJS.Module | undefined = require.main,
  currentModule: NodeJS.Module = module,
): void {
  if (currentMain === currentModule) {
    void bootstrap();
  }
}

runForModule();
