import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';

import { SessionOrgGuard } from './session-org.guard';

describe('SessionOrgGuard', () => {
  const makeContext = (request: Record<string, unknown>) =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as ExecutionContext;

  it('rejects callers without org scope', async () => {
    const sessionsRepository = { findOne: jest.fn() };
    const workflowsRepository = { findOne: jest.fn() };
    const guard = new SessionOrgGuard(sessionsRepository as never, workflowsRepository as never);

    await expect(
      guard.canActivate(makeContext({ user: { id: 'user-1' }, params: { id: 'session-1' } })),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(sessionsRepository.findOne).not.toHaveBeenCalled();
  });

  it('rejects sessions whose workflow is outside the caller org', async () => {
    const sessionsRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'session-1', workflowId: 'workflow-1' }),
    };
    const workflowsRepository = { findOne: jest.fn().mockResolvedValue(null) };
    const guard = new SessionOrgGuard(sessionsRepository as never, workflowsRepository as never);

    await expect(
      guard.canActivate(
        makeContext({
          user: { id: 'user-1', orgId: 'org-1' },
          params: { id: 'session-1' },
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(workflowsRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'workflow-1', orgId: 'org-1' },
      select: ['id'],
    });
  });

  it('allows same-org sessions and attaches the session to the request', async () => {
    const session = { id: 'session-1', workflowId: 'workflow-1' };
    const request = {
      user: { id: 'user-1', orgId: 'org-1' },
      params: { id: 'session-1' },
    };
    const sessionsRepository = { findOne: jest.fn().mockResolvedValue(session) };
    const workflowsRepository = { findOne: jest.fn().mockResolvedValue({ id: 'workflow-1' }) };
    const guard = new SessionOrgGuard(sessionsRepository as never, workflowsRepository as never);

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect(request).toHaveProperty('session', session);
  });
});
