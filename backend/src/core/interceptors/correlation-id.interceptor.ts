import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

import { RequestContextService } from '../context/request-context.service';

type RequestUser = {
  id?: string;
  sub?: string;
  orgId?: string;
  org_id?: string;
  role?: string;
};

type RequestWithContext = Request & {
  user?: RequestUser;
  correlationId?: string;
};

@Injectable()
export class CorrelationIdInterceptor implements NestInterceptor {
  constructor(private readonly requestContext: RequestContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const response = context.switchToHttp().getResponse<Response>();
    const incoming = request.headers['x-correlation-id'];
    const correlationId = Array.isArray(incoming) ? incoming[0] : incoming || uuidv4();
    const user = request.user;

    request.correlationId = correlationId;
    response.setHeader('x-correlation-id', correlationId);

    return this.requestContext.run(
      {
        correlationId,
        userId: user?.id ?? user?.sub,
        orgId: user?.orgId ?? user?.org_id,
        role: user?.role,
      },
      () => next.handle(),
    );
  }
}
