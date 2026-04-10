import { Controller, Get } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AllExceptionsFilter } from '../../src/http/filters/all-exceptions.filter';

@Controller('__test__')
class ThrowingController {
  @Get('raw-error')
  throwRaw(): never {
    throw new Error('unexpected crash');
  }
}

describe('AllExceptionsFilter (integration)', () => {
  it('returns 500 without stack trace when a raw Error is thrown from a route', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ThrowingController],
    }).compile();

    const app = moduleRef.createNestApplication();
    const httpAdapterHost = app.get(HttpAdapterHost);
    app.useGlobalFilters(new AllExceptionsFilter(httpAdapterHost));
    await app.init();

    const response = await request(app.getHttpServer())
      .get('/__test__/raw-error')
      .expect(500);

    expect(response.body).toEqual({ statusCode: 500, message: 'Internal server error' });
    expect(response.body).not.toHaveProperty('stack');
    expect(response.body).not.toHaveProperty('trace');

    await app.close();
  });
});
