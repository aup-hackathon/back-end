import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { RequestContextService } from '../context/request-context.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt-access') implements CanActivate {
  constructor(
    private reflector: Reflector,
    private readonly requestContext: RequestContextService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();

    if (process.env.DEV_BYPASS_AUTH === 'true' && !request.headers.authorization) {
      request.user = {
        id: '00000000-0000-0000-0000-000000000001',
        role: 'admin',
        orgId: '00000000-0000-0000-0000-00000000a000',
      };
      this.requestContext.setContext({
        userId: request.user.id,
        role: request.user.role,
        orgId: request.user.orgId,
      });
      return true;
    }


    return (await super.canActivate(context)) as boolean;
  }

  handleRequest(err, user) {
    if (err || !user) {
      throw err || new UnauthorizedException();
    }
    return user;
  }
}
