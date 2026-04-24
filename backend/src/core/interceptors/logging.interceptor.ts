import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Logger } from 'nestjs-pino';

type RequestUser = {
  id?: string;
  sub?: string;
  orgId?: string;
  org_id?: string;
};

type RequestWithContext = Request & {
  user?: RequestUser;
  correlationId?: string;
};

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: Logger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const response = context.switchToHttp().getResponse<Response>();
    const { method, originalUrl, url } = request;
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const durationMs = Date.now() - startTime;
          this.logger.log({
            msg: 'request completed',
            method,
            path: originalUrl ?? url,
            statusCode: response.statusCode,
            duration_ms: durationMs,
            user_id: request.user?.id ?? request.user?.sub,
            org_id: request.user?.orgId ?? request.user?.org_id,
            correlationId: request.correlationId,
          });
        },
        error: (err) => {
          const durationMs = Date.now() - startTime;
          this.logger.error({
            msg: 'request failed',
            method,
            path: originalUrl ?? url,
            statusCode: err?.status ?? response.statusCode,
            duration_ms: durationMs,
            user_id: request.user?.id ?? request.user?.sub,
            org_id: request.user?.orgId ?? request.user?.org_id,
            correlationId: request.correlationId,
            error: err.message,
          });
        },
      }),
    );
  }
}
