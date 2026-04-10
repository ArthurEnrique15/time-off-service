import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';

import { AllExceptionsFilter } from './all-exceptions.filter';

const mockReply = jest.fn();
const mockHttpAdapterHost = {
  httpAdapter: { reply: mockReply },
} as unknown as HttpAdapterHost;

const makeHost = (method = 'GET', url = '/test') =>
  ({
    switchToHttp: () => ({
      getResponse: () => ({}),
      getRequest: () => ({ method, url }),
    }),
  }) as any;

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    filter = new AllExceptionsFilter(mockHttpAdapterHost);
    mockReply.mockClear();
  });

  describe('non-HttpException path', () => {
    it('replies with 500 and a safe body', () => {
      filter.catch(new Error('boom'), makeHost());

      expect(mockReply).toHaveBeenCalledWith(
        expect.anything(),
        { statusCode: 500, message: 'Internal server error' },
        500,
      );
    });

    it('logs method, url, and stack', () => {
      const err = new Error('crash');
      filter.catch(err, makeHost('POST', '/foo'));

      expect(Logger.prototype.error).toHaveBeenCalledWith(
        expect.stringContaining('POST /foo: crash'),
        err.stack,
      );
    });

    it('handles non-Error thrown values', () => {
      filter.catch('string-throw', makeHost());

      expect(mockReply).toHaveBeenCalledWith(
        expect.anything(),
        { statusCode: 500, message: 'Internal server error' },
        500,
      );
    });
  });

  describe('HttpException pass-through', () => {
    it('replies with the original status and response', () => {
      const exception = new HttpException(
        { statusCode: 404, message: 'Not Found', error: 'Not Found' },
        HttpStatus.NOT_FOUND,
      );
      filter.catch(exception, makeHost());

      expect(mockReply).toHaveBeenCalledWith(
        expect.anything(),
        { statusCode: 404, message: 'Not Found', error: 'Not Found' },
        404,
      );
    });

    it('does not call logger for HttpExceptions', () => {
      filter.catch(new HttpException('ok', 200), makeHost());

      expect(Logger.prototype.error).not.toHaveBeenCalled();
    });
  });
});
