import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();

    if (exception instanceof HttpException) {
      httpAdapter.reply(ctx.getResponse(), exception.getResponse(), exception.getStatus());
      return;
    }

    const message = exception instanceof Error ? exception.message : String(exception);
    const stack = exception instanceof Error ? exception.stack : undefined;
    const request = ctx.getRequest<{ method: string; url: string }>();

    this.logger.error(`Unhandled exception on ${request.method} ${request.url}: ${message}`, stack);

    httpAdapter.reply(
      ctx.getResponse(),
      { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error' },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
