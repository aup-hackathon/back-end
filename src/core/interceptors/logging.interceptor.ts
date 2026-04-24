import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Logger } from 'nestjs-pino';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: Logger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url } = request;
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          this.logger.log({
            msg: `Request completed: ${method} ${url}`,
            duration,
            status: 200,
          });
        },
        error: (err) => {
          const duration = Date.now() - startTime;
          this.logger.error({
            msg: `Request failed: ${method} ${url}`,
            duration,
            error: err.message,
          });
        },
      }),
    );
  }
}
