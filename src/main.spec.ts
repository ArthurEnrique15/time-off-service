import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

jest.mock('@nestjs/core', () => ({
  NestFactory: {
    create: jest.fn(),
  },
}));

describe('bootstrap', () => {
  it('creates the app and starts listening on the configured port', async () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3000';
    process.env.DATABASE_URL = 'file:./test.db';
    process.env.HCM_API_BASE_URL = 'http://127.0.0.1:4010';
    process.env.HCM_TIMEOUT_MS = '1500';

    const { AppModule } = await import('./app.module');
    const { bootstrap } = await import('./main');
    const app = {
      useGlobalPipes: jest.fn(),
      get: jest.fn().mockReturnValue({
        get: jest.fn().mockReturnValue(3000),
      }),
      listen: jest.fn().mockResolvedValue(undefined),
    };

    (NestFactory.create as jest.Mock).mockResolvedValue(app);

    await bootstrap();

    expect(NestFactory.create).toHaveBeenCalledWith(AppModule, { cors: true });
    expect(app.useGlobalPipes).toHaveBeenCalledWith(expect.any(ValidationPipe));
    expect(app.listen).toHaveBeenCalledWith(3000);
  });

  it('boots automatically when executed as the main module', async () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3000';
    process.env.DATABASE_URL = 'file:./test.db';
    process.env.HCM_API_BASE_URL = 'http://127.0.0.1:4010';
    process.env.HCM_TIMEOUT_MS = '1500';

    const { runForModule } = await import('./main');
    const app = {
      useGlobalPipes: jest.fn(),
      get: jest.fn().mockReturnValue({
        get: jest.fn().mockReturnValue(3000),
      }),
      listen: jest.fn().mockResolvedValue(undefined),
    };

    (NestFactory.create as jest.Mock).mockResolvedValue(app);

    runForModule(module, module);
    await Promise.resolve();

    expect(NestFactory.create).toHaveBeenCalled();
  });
});
