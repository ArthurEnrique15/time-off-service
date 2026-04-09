import { Controller, Get } from '@nestjs/common';

import { HealthService, type HealthResponse } from '@core/services/health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  getHealth(): Promise<HealthResponse> {
    return this.healthService.getHealth();
  }
}
