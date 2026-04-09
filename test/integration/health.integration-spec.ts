import { Test } from '@nestjs/testing';
import request from 'supertest';

import { startMockHcmServer } from '../support/mock-hcm-server';
import { setTestEnvironment } from '../support/test-env';

describe('GET /health', () => {
  it('returns the runtime health payload with dependency reachability', async () => {
    const mockHcmServer = await startMockHcmServer();
    const testEnvironment = setTestEnvironment({ hcmBaseUrl: mockHcmServer.baseUrl });

    jest.resetModules();

    const { AppModule } = await import('../../src/app.module');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const app = moduleRef.createNestApplication();

    await app.init();

    await request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({
        status: 'ok',
        environment: 'test',
        dependencies: {
          database: 'up',
          hcm: 'up',
        },
      });

    await app.close();
    await mockHcmServer.close();
    testEnvironment.cleanup();
  });
});
