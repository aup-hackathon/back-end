import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { RequestContextService } from '../context/request-context.service';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  const originalDevBypass = process.env.DEV_BYPASS_AUTH;

  afterEach(() => {
    process.env.DEV_BYPASS_AUTH = originalDevBypass;
  });

  it('injects a synthetic admin when DEV_BYPASS_AUTH=true and no auth header exists', async () => {
    process.env.DEV_BYPASS_AUTH = 'true';
    const request = { headers: {} };
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const requestContext = new RequestContextService();
    const guard = new JwtAuthGuard(reflector, requestContext);
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;

    let store;
    const allowed = await requestContext.run({ correlationId: 'test-correlation' }, async () => {
      const result = await guard.canActivate(context);
      store = requestContext.getStore();
      return result;
    });

    expect(allowed).toBe(true);
    expect(request).toHaveProperty('user');
    expect((request as any).user).toEqual(
      expect.objectContaining({
        id: '00000000-0000-0000-0000-000000000001',
        role: 'admin',
        orgId: '00000000-0000-0000-0000-00000000a000',
      }),
    );
    expect(store).toEqual(
      expect.objectContaining({
        userId: '00000000-0000-0000-0000-000000000001',
        role: 'admin',
        orgId: '00000000-0000-0000-0000-00000000a000',
      }),
    );
  });
});
