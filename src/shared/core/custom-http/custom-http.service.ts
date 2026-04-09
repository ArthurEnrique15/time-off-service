import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import type { AxiosRequestConfig, AxiosResponse } from 'axios';

@Injectable()
export class CustomHttpService {
  private readonly logger = new Logger(CustomHttpService.name);

  constructor(private readonly httpService: HttpService) {}

  async request<T = any, D = any>(config: AxiosRequestConfig<D>): Promise<AxiosResponse<T>> {
    try {
      const response = await this.httpService.axiosRef.request<T, AxiosResponse<T>, D>(config);

      return response;
    } catch (error: any) {
      this.logger.error('Request error', {
        method: config.method,
        url: config.url,
        status: error.response?.status,
        message: error.message,
      });

      if (error.response) {
        return error.response;
      }

      return {
        status: 500,
        statusText: 'Internal Server Error',
        data: { error },
        headers: {},
        config,
      } as AxiosResponse;
    }
  }
}
