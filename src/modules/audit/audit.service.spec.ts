import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { ActorType, UserRole } from '../../database/enums';
import { DECISION_EVENT_TYPES } from './audit.constants';
import { AuditService } from './audit.service';

describe('AuditService', () => {
  const currentUser = {
    id: 'user-1',
    orgId: 'org-1',
    role: UserRole.BUSINESS_ANALYST,
  };

  const buildService = () => {
    const auditLogRepository = {
      create: jest.fn((value) => ({
        id: 'audit-1',
        createdAt: new Date('2026-04-25T12:00:00.000Z'),
        ...value,
      })),
      save: jest.fn(async (value) => value),
      createQueryBuilder: jest.fn(),
      find: jest.fn(),
    };
    const workflowRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'workflow-1', orgId: 'org-1' }),
    };

    return {
      service: new AuditService(auditLogRepository as never, workflowRepository as never),
      auditLogRepository,
      workflowRepository,
    };
  };

  it.each(['WORKFLOW_CREATED', ...DECISION_EVENT_TYPES])(
    'creates a new immutable audit entry for %s',
    async (eventType) => {
      const { service, auditLogRepository } = buildService();

      const result = await service.log({
        workflowId: 'workflow-1',
        actorId: 'user-1',
        actorType: ActorType.USER,
        eventType,
        beforeState: null,
        afterState: { ok: true },
      });

      expect(auditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowId: 'workflow-1',
          actorId: 'user-1',
          actorType: ActorType.USER,
          eventType,
          beforeState: null,
          afterState: { ok: true },
        }),
      );
      expect(auditLogRepository.save).toHaveBeenCalled();
      expect(result.eventType).toBe(eventType);
    },
  );

  it('rejects attempts to reuse log() as an update path', async () => {
    const { service } = buildService();

    await expect(
      service.log({
        id: 'audit-1',
        workflowId: 'workflow-1',
        actorId: 'user-1',
        actorType: ActorType.USER,
        eventType: 'WORKFLOW_UPDATED',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('denies audit log reads to non-audit roles', async () => {
    const { service } = buildService();

    await expect(
      service.getWorkflowAuditLog(
        'workflow-1',
        { ...currentUser, role: UserRole.REVIEWER },
        { page: 1, limit: 20 },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

