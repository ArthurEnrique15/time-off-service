import { Injectable } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';

import { EnvConfigService } from '@shared/config/env';
import { CustomHttpService } from '@shared/core/custom-http';
import { Failure, Success } from '@shared/core/either';

import type {
  CancelTimeOffResult,
  GetBalanceResult,
  HcmError,
  HcmErrorCode,
  HcmSubmitRequest,
  SubmitTimeOffResult,
} from './hcm.types';

@Injectable()
export class HcmClient {
  constructor(
    private readonly customHttpService: CustomHttpService,
    private readonly envConfigService: EnvConfigService,
  ) {}

  async checkConnection(): Promise<boolean> {
    const response = await this.customHttpService.request({
      method: 'GET',
      url: `${this.baseUrl}/health`,
      timeout: this.timeout,
    });

    return response.status === HttpStatus.OK;
  }

  async getBalance(employeeId: string, locationId: string): Promise<GetBalanceResult> {
    const response = await this.customHttpService.request({
      method: 'GET',
      url: `${this.baseUrl}/balances/${encodeURIComponent(employeeId)}/${encodeURIComponent(locationId)}`,
      timeout: this.timeout,
    });

    if (response.status === HttpStatus.OK) {
      return Success.create(response.data);
    }

    return Failure.create(this.toHcmError(response.status, response.data));
  }

  async submitTimeOff(request: HcmSubmitRequest): Promise<SubmitTimeOffResult> {
    const response = await this.customHttpService.request({
      method: 'POST',
      url: `${this.baseUrl}/time-off-requests`,
      timeout: this.timeout,
      data: request,
    });

    if (response.status === HttpStatus.CREATED) {
      return Success.create(response.data);
    }

    return Failure.create(this.toHcmError(response.status, response.data));
  }

  async cancelTimeOff(requestId: string): Promise<CancelTimeOffResult> {
    const response = await this.customHttpService.request({
      method: 'DELETE',
      url: `${this.baseUrl}/time-off-requests/${encodeURIComponent(requestId)}`,
      timeout: this.timeout,
    });

    if (response.status === HttpStatus.NO_CONTENT) {
      return Success.create(undefined);
    }

    return Failure.create(this.toHcmError(response.status, response.data));
  }

  private get baseUrl(): string {
    return this.envConfigService.get('hcm.apiBaseUrl');
  }

  private get timeout(): number {
    return this.envConfigService.get('hcm.timeoutMs');
  }

  private toHcmError(statusCode: number, data: any): HcmError {
    const knownCodes: HcmErrorCode[] = ['INVALID_DIMENSIONS', 'INSUFFICIENT_BALANCE', 'NOT_FOUND'];

    const code: HcmErrorCode = knownCodes.includes(data?.error) ? data.error : 'UNKNOWN';
    const message: string = data?.message ?? `HCM responded with status ${statusCode}`;

    return { code, message, statusCode };
  }
}
