import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';

import { ActorType, UserRole } from '../../database/enums';
import { OrganizationsService } from './organizations.service';
import { RequestUser } from './types/request-user.type';

describe('OrganizationsService', () => {
  const adminCaller: RequestUser = {
    id: 'admin-1',
    orgId: 'org-1',
    role: UserRole.ADMIN,
  };

  const makeService = () => {
    const usersRepository = {
      create: jest.fn((value) => ({ id: 'created-user', ...value })),
      findOne: jest.fn(),
      save: jest.fn((value) => Promise.resolve(value)),
      count: jest.fn(),
    };
    const refreshTokensRepository = {
      update: jest.fn().mockResolvedValue({ affected: 2 }),
    };
    const auditLogsRepository = {
      insert: jest.fn().mockResolvedValue({}),
    };
    const mailer = {
      sendInvite: jest.fn().mockResolvedValue(undefined),
    };

    const service = new OrganizationsService(
      usersRepository as never,
      refreshTokensRepository as never,
      auditLogsRepository as never,
      mailer as never,
    );

    return {
      service,
      usersRepository,
      refreshTokensRepository,
      auditLogsRepository,
      mailer,
    };
  };

  it('creates pending invite users scoped to the caller organization', async () => {
    const { service, usersRepository, auditLogsRepository, mailer } = makeService();
    usersRepository.findOne.mockResolvedValue(null);

    const result = await service.inviteUser(
      { email: 'Analyst@Example.com', role: UserRole.BUSINESS_ANALYST },
      adminCaller,
    );

    expect(usersRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'analyst@example.com',
        role: UserRole.BUSINESS_ANALYST,
        orgId: 'org-1',
        isVerified: false,
        isActive: true,
      }),
    );
    expect(usersRepository.create.mock.calls[0][0].passwordHash).toMatch(/^pending-invite:/);
    expect(usersRepository.create.mock.calls[0][0].inviteTokenHash).toHaveLength(64);
    expect(mailer.sendInvite).toHaveBeenCalledWith('analyst@example.com', expect.any(String));
    expect(auditLogsRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'admin-1',
        actorType: ActorType.USER,
        eventType: 'ORG_USER_INVITED',
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 'created-user',
        email: 'analyst@example.com',
        role: UserRole.BUSINESS_ANALYST,
        orgId: 'org-1',
        inviteToken: expect.any(String),
      }),
    );
  });

  it('rejects duplicate invite emails', async () => {
    const { service, usersRepository } = makeService();
    usersRepository.findOne.mockResolvedValue({ id: 'existing-user' });

    await expect(
      service.inviteUser({ email: 'user@example.com' }, adminCaller),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('requires admin role for organization management', async () => {
    const { service } = makeService();

    await expect(
      service.inviteUser(
        { email: 'viewer@example.com' },
        { id: 'viewer-1', orgId: 'org-1', role: UserRole.VIEWER },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks downgrading the last active admin', async () => {
    const { service, usersRepository } = makeService();
    usersRepository.findOne.mockResolvedValue({
      id: 'admin-2',
      orgId: 'org-1',
      role: UserRole.ADMIN,
    });
    usersRepository.count.mockResolvedValue(1);

    await expect(
      service.updateUserRole('admin-2', { role: UserRole.PROCESS_OWNER }, adminCaller),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(usersRepository.save).not.toHaveBeenCalled();
  });

  it('updates same-org user roles and writes an audit log', async () => {
    const { service, usersRepository, auditLogsRepository } = makeService();
    usersRepository.findOne.mockResolvedValue({
      id: 'user-2',
      email: 'user@example.com',
      orgId: 'org-1',
      role: UserRole.VIEWER,
      isActive: true,
      isVerified: true,
    });

    const result = await service.updateUserRole('user-2', { role: UserRole.REVIEWER }, adminCaller);

    expect(usersRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'user-2', orgId: 'org-1' },
    });
    expect(usersRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ role: UserRole.REVIEWER }),
    );
    expect(auditLogsRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'admin-1',
        eventType: 'ORG_USER_ROLE_UPDATED',
        beforeState: { user_id: 'user-2', role: UserRole.VIEWER },
        afterState: { user_id: 'user-2', role: UserRole.REVIEWER },
      }),
    );
    expect(result.role).toBe(UserRole.REVIEWER);
  });

  it('revokes same-org users, refresh tokens, and audit logs access removal', async () => {
    const { service, usersRepository, refreshTokensRepository, auditLogsRepository } =
      makeService();
    usersRepository.findOne.mockResolvedValue({
      id: 'user-2',
      orgId: 'org-1',
      role: UserRole.VIEWER,
      isActive: true,
    });

    await expect(service.revokeUser('user-2', adminCaller)).resolves.toEqual({ revoked: true });
    expect(usersRepository.save).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
    expect(refreshTokensRepository.update).toHaveBeenCalledWith(
      { userId: 'user-2' },
      { revoked: true },
    );
    expect(auditLogsRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'ORG_USER_REVOKED',
        beforeState: { user_id: 'user-2', is_active: true },
        afterState: { user_id: 'user-2', is_active: false },
      }),
    );
  });
});
