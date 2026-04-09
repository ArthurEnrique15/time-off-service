import type { HttpService } from '@nestjs/axios';
import { Logger } from '@nestjs/common';
import type { AxiosRequestConfig, AxiosResponse } from 'axios';

import { CustomHttpService } from './custom-http.service';

describe('CustomHttpService', () => {
  let loggerSpy: jest.SpyInstance;

  beforeAll(() => {
    loggerSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterAll(() => {
    loggerSpy.mockRestore();
  });

  const createService = () => {
    const mockAxiosRef = {
      request: jest.fn(),
    };

    const httpService = {
      axiosRef: mockAxiosRef,
    } as unknown as HttpService;

    const service = new CustomHttpService(httpService);

    return { service, mockAxiosRef };
  };

  it('returns the AxiosResponse when the request succeeds', async () => {
    const { service, mockAxiosRef } = createService();
    const expectedResponse: AxiosResponse = {
      status: 200,
      data: { result: 'ok' },
      statusText: 'OK',
      headers: {},
      config: {} as any,
    };

    mockAxiosRef.request.mockResolvedValue(expectedResponse);

    const config: AxiosRequestConfig = { method: 'GET', url: '/test' };
    const result = await service.request(config);

    expect(result).toBe(expectedResponse);
    expect(mockAxiosRef.request).toHaveBeenCalledWith(config);
  });

  it('returns the error response when the request fails with an HTTP error', async () => {
    const { service, mockAxiosRef } = createService();
    const errorResponse: AxiosResponse = {
      status: 404,
      data: { error: 'NOT_FOUND' },
      statusText: 'Not Found',
      headers: {},
      config: {} as any,
    };

    mockAxiosRef.request.mockRejectedValue({ response: errorResponse, message: 'Not Found' });

    const result = await service.request({ method: 'GET', url: '/missing' });

    expect(result).toBe(errorResponse);
    expect(loggerSpy).toHaveBeenCalledWith('Request error', {
      method: 'GET',
      url: '/missing',
      status: 404,
      message: 'Not Found',
    });
  });

  it('returns a normalized 500 response when the request fails with a network error', async () => {
    const { service, mockAxiosRef } = createService();
    const networkError = new Error('ECONNREFUSED');

    mockAxiosRef.request.mockRejectedValue(networkError);

    const config: AxiosRequestConfig = { method: 'GET', url: '/unreachable' };
    const result = await service.request(config);

    expect(result.status).toBe(500);
    expect(result.statusText).toBe('Internal Server Error');
    expect(result.data).toEqual({ error: networkError });
    expect(result.headers).toEqual({});
    expect(loggerSpy).toHaveBeenCalledWith('Request error', {
      method: 'GET',
      url: '/unreachable',
      status: undefined,
      message: 'ECONNREFUSED',
    });
  });
});
