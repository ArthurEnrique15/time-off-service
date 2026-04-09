import type { HealthService } from '@core/services/health.service';

import { HealthController } from '@http/controllers/health.controller';

describe('HealthController', () => {
  it('delegates the response generation to the health service', async () => {
    const expectedResponse = {
      status: 'ok',
      environment: 'test',
      dependencies: {
        database: 'up',
        hcm: 'up',
      },
    };

    const healthService = {
      getHealth: jest.fn().mockResolvedValue(expectedResponse),
    } as unknown as HealthService;

    const controller = new HealthController(healthService);

    await expect(controller.getHealth()).resolves.toEqual(expectedResponse);
    expect(healthService.getHealth).toHaveBeenCalledTimes(1);
  });
});
