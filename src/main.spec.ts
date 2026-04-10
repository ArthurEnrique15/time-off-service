import { ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';

import { AllExceptionsFilter } from './http/filters/all-exceptions.filter';

jest.mock('@nestjs/core', () => ({
  NestFactory: {
    create: jest.fn(),
  },
  HttpAdapterHost: class HttpAdapterHost {},
}));

const makeApp = () => ({
  useGlobalPipes: jest.fn(),
  useGlobalFilters: jest.fn(),
  get: jest.fn().mockImplementation((token: unknown) => {
    if (token === HttpAdapterHost) {
      return { httpAdapter: {} };
    }
    return { get: jest.fn().mockReturnValue(3000) };
  }),
  listen: jest.fn().mockResolvedValue(undefined),
});

describe('bootstrap', () => {
  it('creates the app and starts listening on the configured port', async () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3000';
    process.env.DATABASE_URL = 'file:./test.db';
    process.env.HCM_API_BASE_URL = 'http://127.0.0.1:4010';
    process.env.HCM_TIMEOUT_MS = '1500';

    const { AppModule } = await import('./app.module');
    const { bootstrap } = await import('./main');
    const app = makeApp();

    (NestFactory.create as jest.Mock).mockResolvedValue(app);

    await bootstrap();

    expect(NestFactory.create).toHaveBeenCalledWith(AppModule, { cors: true });
    expect(app.useGlobalPipes).toHaveBeenCalledWith(expect.any(ValidationPipe));
    expect(app.useGlobalFilters).toHaveBeenCalledWith(expect.any(AllExceptionsFilter));
    expect(app.listen).toHaveBeenCalledWith(3000);
  });

  it('boots automatically when executed as the main module', async () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3000';
    process.env.DATABASE_URL = 'file:./test.db';
    process.env.HCM_API_BASE_URL = 'http://127.0.0.1:4010';
    process.env.HCM_TIMEOUT_MS = '1500';

    const { runForModule } = await import('./main');
    const app = makeApp();

    (NestFactory.create as jest.Mock).mockResolvedValue(app);

    runForModule(module, module);
    await Promise.resolve();

    expect(NestFactory.create).toHaveBeenCalled();
  });
});
