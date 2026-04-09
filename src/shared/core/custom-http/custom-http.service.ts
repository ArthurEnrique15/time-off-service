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
    } catch (error) {
      this.logger.error('Request error', {
        method: config.method,
        url: config.url,
        error,
      });

      if (error.response) {
        return error.response;
      }

      return { status: 500, data: { error } } as AxiosResponse;
    }
  }
}
