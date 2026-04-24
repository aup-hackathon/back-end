import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { Request } from 'express';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { RequestContextService } from '../context/request-context.service';

type RequestUser = {
  orgId?: string;
  org_id?: string;
};

@Injectable()
export class OrgScopeInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly requestContext: RequestContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return next.handle();

    const user = request.user as RequestUser | undefined;
    const orgId = user?.orgId ?? user?.org_id;

    if (user && !orgId) {
      throw new ForbiddenException('Organization scope is required');
    }

    if (orgId) {
      request['orgId'] = orgId;
      this.requestContext.setContext({ orgId });
    }

    return next.handle();
  }
}
