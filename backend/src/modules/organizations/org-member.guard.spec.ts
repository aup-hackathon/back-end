import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';

import { UserRole } from '../../database/enums';
import { OrgMemberGuard } from './org-member.guard';

describe('OrgMemberGuard', () => {
  const makeContext = (request: Record<string, unknown>) =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as ExecutionContext;

  it('rejects requests without organization scope', async () => {
    const usersRepository = {
      findOne: jest.fn(),
    };
    const guard = new OrgMemberGuard(usersRepository as never);

    await expect(
      guard.canActivate(
        makeContext({
          user: { id: 'user-1', role: UserRole.ADMIN },
          params: { id: 'target-1' },
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(usersRepository.findOne).not.toHaveBeenCalled();
  });

  it('allows non-member routes without a target user id', async () => {
    const usersRepository = {
      findOne: jest.fn(),
    };
    const guard = new OrgMemberGuard(usersRepository as never);

    await expect(
      guard.canActivate(
        makeContext({
          user: { id: 'user-1', role: UserRole.ADMIN, orgId: 'org-1' },
          params: {},
        }),
      ),
    ).resolves.toBe(true);
    expect(usersRepository.findOne).not.toHaveBeenCalled();
  });

  it('rejects cross-organization target users', async () => {
    const usersRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'target-1', orgId: 'org-2' }),
    };
    const guard = new OrgMemberGuard(usersRepository as never);

    await expect(
      guard.canActivate(
        makeContext({
          user: { id: 'user-1', role: UserRole.ADMIN, orgId: 'org-1' },
          params: { id: 'target-1' },
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('allows same-organization target users', async () => {
    const usersRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'target-1', orgId: 'org-1' }),
    };
    const guard = new OrgMemberGuard(usersRepository as never);

    await expect(
      guard.canActivate(
        makeContext({
          user: { id: 'user-1', role: UserRole.ADMIN, orgId: 'org-1' },
          params: { id: 'target-1' },
        }),
      ),
    ).resolves.toBe(true);
    expect(usersRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'target-1' },
      select: ['id', 'orgId'],
    });
  });
});
