import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';

export class HttpExceptionFilter extends BaseExceptionFilter {
  constructor(private readonly logger: Logger) {
    super();
  }

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException ? exception.getResponse() : 'Internal server error';

    const responseBody = {
      statusCode: status,
      error: (message as any).error || 'InternalServerError',
      message: (message as any).message || message,
      correlationId: request.headers['x-correlation-id'] || uuidv4(),
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    this.logger.error({
      msg: `HTTP Error: ${status} - ${request.url}`,
      error: exception,
      correlationId: responseBody.correlationId,
    });

    response.status(status).json(responseBody);
  }
}
