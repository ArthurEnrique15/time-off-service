import { Injectable } from '@nestjs/common';

import { EnvConfigService } from '@shared/config/env';

@Injectable()
export class HcmClient {
  constructor(private readonly envConfigService: EnvConfigService) {}

  async checkConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.envConfigService.get('hcm.apiBaseUrl')}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(this.envConfigService.get('hcm.timeoutMs')),
      });

      return response.ok;
    } catch {
      return false;
    }
  }
}
