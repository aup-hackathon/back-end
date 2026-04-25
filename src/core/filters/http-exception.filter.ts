import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

type RequestWithContext = Request & {
  correlationId?: string;
};

type ExceptionResponse = {
  error?: string;
  message?: unknown;
  code?: string;
  [key: string]: unknown;
};

@Catch()
export class HttpExceptionFilter extends BaseExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {
    super();
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithContext>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : 'Internal server error';
    const normalized = this.normalizeResponse(exceptionResponse, status);
    const headerCorrelationId = request.headers['x-correlation-id'];
    const correlationId =
      request.correlationId ||
      (Array.isArray(headerCorrelationId) ? headerCorrelationId[0] : headerCorrelationId) ||
      uuidv4();

    const responseBody = {
      statusCode: status,
      error: normalized.error,
      message: normalized.message,
      correlationId,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    response.setHeader('x-correlation-id', correlationId);

    if (status >= 500) {
      this.logger.error({
        msg: 'unhandled request exception',
        statusCode: status,
        path: request.url,
        error: exception instanceof Error ? exception.stack : exception,
        correlationId,
      });
    } else {
      this.logger.warn({
        msg: 'request exception',
        statusCode: status,
        path: request.url,
        error: responseBody.error,
        correlationId,
      });
    }

    response.status(status).json(responseBody);
  }

  private normalizeResponse(exceptionResponse: string | object, status: number) {
    if (typeof exceptionResponse === 'string') {
      return {
        error: this.errorNameForStatus(status),
        message: exceptionResponse,
      };
    }

    const response = exceptionResponse as ExceptionResponse;
    const error =
      status === HttpStatus.BAD_REQUEST
        ? 'ValidationError'
        : (response.error ?? this.errorNameForStatus(status));

    if (typeof response.message !== 'undefined') {
      return {
        error,
        message: response.message,
      };
    }

    const structuredPayload = Object.fromEntries(
      Object.entries(response).filter(([key]) => key !== 'error'),
    );

    if (Object.keys(structuredPayload).length > 0) {
      return {
        error,
        message: structuredPayload,
      };
    }

    return {
      error,
      message: this.errorNameForStatus(status),
    };
  }

  private errorNameForStatus(status: number): string {
    if (status === HttpStatus.BAD_REQUEST) return 'ValidationError';
    if (status === HttpStatus.UNAUTHORIZED) return 'Unauthorized';
    if (status === HttpStatus.FORBIDDEN) return 'Forbidden';
    if (status === HttpStatus.NOT_FOUND) return 'NotFound';
    if (status === HttpStatus.CONFLICT) return 'Conflict';
    if (status === HttpStatus.UNPROCESSABLE_ENTITY) return 'UnprocessableEntity';
    if (status === HttpStatus.TOO_MANY_REQUESTS) return 'TooManyRequests';
    return status >= 500 ? 'InternalServerError' : 'HttpError';
  }
}
