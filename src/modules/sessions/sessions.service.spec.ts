import { ConflictException, ForbiddenException } from '@nestjs/common';

import {
  ActorType,
  PipelineStatus,
  SessionMode,
  SessionStatus,
  UserRole,
} from '../../database/enums';
import { SessionsService } from './sessions.service';

describe('SessionsService', () => {
  const caller = {
    id: 'user-1',
    orgId: 'org-1',
    role: UserRole.ADMIN,
  };

  const baseSession = {
    id: 'session-1',
    workflowId: 'workflow-1',
    userId: 'user-1',
    mode: SessionMode.INTERACTIVE,
    status: SessionStatus.CREATED,
    confidenceScore: 0.72,
    createdAt: new Date('2026-04-24T10:00:00.000Z'),
    finalizedAt: null,
    archivedAt: null,
  };

  const makeService = () => {
    const sessionsRepository = {
      create: jest.fn((value) => ({ id: 'session-new', ...value })),
      save: jest.fn((value) => Promise.resolve(value)),
      findOne: jest.fn().mockResolvedValue({ ...baseSession }),
    };
    const workflowsRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'workflow-1', orgId: 'org-1' }),
    };
    const workflowVersionsRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'version-1',
        workflowId: 'workflow-1',
        versionNumber: 3,
        elementsJson: { nodes: [] },
      }),
    };
    const pipelineExecutionsRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'pipeline-1',
        sessionId: 'session-1',
        status: PipelineStatus.COMPLETED,
        lastCheckpointAgent: 'VALIDATION',
        finalConfidence: 0.91,
      }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const messagesRepository = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const documentsRepository = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const auditLogsRepository = {
      insert: jest.fn().mockResolvedValue({}),
    };
    const natsPublisher = {
      publishSessionFinalized: jest.fn().mockResolvedValue(undefined),
    };
    const realtimeEvents = {
      emitNeedsReconciliation: jest.fn(),
    };

    const service = new SessionsService(
      sessionsRepository as never,
      workflowsRepository as never,
      workflowVersionsRepository as never,
      pipelineExecutionsRepository as never,
      messagesRepository as never,
      documentsRepository as never,
      auditLogsRepository as never,
      natsPublisher as never,
      realtimeEvents as never,
    );

    return {
      service,
      sessionsRepository,
      workflowsRepository,
      workflowVersionsRepository,
      pipelineExecutionsRepository,
      messagesRepository,
      documentsRepository,
      auditLogsRepository,
      natsPublisher,
      realtimeEvents,
    };
  };

  it('creates sessions scoped through the workflow org', async () => {
    const { service, workflowsRepository, sessionsRepository } = makeService();

    await expect(
      service.createSession({ workflowId: 'workflow-1', mode: SessionMode.AUTO }, caller),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'session-new',
        workflowId: 'workflow-1',
        userId: 'user-1',
        status: SessionStatus.CREATED,
      }),
    );
    expect(workflowsRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'workflow-1', orgId: 'org-1' },
    });
    expect(sessionsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ mode: SessionMode.AUTO }),
    );
  });

  it('mode switch requires owner or admin and writes audit', async () => {
    const { service, auditLogsRepository } = makeService();

    const result = await service.updateMode(
      'session-1',
      { mode: SessionMode.AUTO },
      { id: 'owner-2', orgId: 'org-1', role: UserRole.ADMIN },
    );

    expect(result.mode).toBe(SessionMode.AUTO);
    expect(auditLogsRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: ActorType.USER,
        eventType: 'SESSION_MODE_UPDATED',
        beforeState: { mode: SessionMode.INTERACTIVE },
        afterState: { mode: SessionMode.AUTO },
      }),
    );
  });

  it('rejects non-owner non-admin management', async () => {
    const { service } = makeService();

    await expect(
      service.updateMode(
        'session-1',
        { mode: SessionMode.AUTO },
        { id: 'other-user', orgId: 'org-1', role: UserRole.BUSINESS_ANALYST },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('finalizes sessions and publishes the session finalized event', async () => {
    const { service, sessionsRepository, natsPublisher, auditLogsRepository } = makeService();

    const result = await service.finalize('session-1', caller);

    expect(result.status).toBe(SessionStatus.DRAFT_READY);
    expect(sessionsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: SessionStatus.DRAFT_READY, finalizedAt: expect.any(Date) }),
    );
    expect(natsPublisher.publishSessionFinalized).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: 'session-1',
        workflow_id: 'workflow-1',
        final_version_number: 3,
        final_confidence: 0.72,
      }),
    );
    expect(auditLogsRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'SESSION_FINALIZED' }),
    );
  });

  it('archives sessions and cascade-archives related rows', async () => {
    const {
      service,
      messagesRepository,
      documentsRepository,
      pipelineExecutionsRepository,
      auditLogsRepository,
    } = makeService();

    const result = await service.archive('session-1', caller);

    expect(result.status).toBe(SessionStatus.ARCHIVED);
    expect(messagesRepository.update).toHaveBeenCalledWith(
      { sessionId: 'session-1' },
      { archivedAt: expect.any(Date) },
    );
    expect(documentsRepository.update).toHaveBeenCalledWith(
      { sessionId: 'session-1' },
      { archivedAt: expect.any(Date) },
    );
    expect(pipelineExecutionsRepository.update).toHaveBeenCalledWith(
      { sessionId: 'session-1' },
      { archivedAt: expect.any(Date) },
    );
    expect(auditLogsRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'SESSION_ARCHIVED' }),
    );
  });

  it('manual status override returns 409 when it violates the FSM without force', async () => {
    const { service } = makeService();

    await expect(
      service.overrideStatus(
        'session-1',
        { status: SessionStatus.VALIDATED, reason: 'bad jump' },
        caller,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('emits needs reconciliation event on forced override to needs_reconciliation', async () => {
    const { service, realtimeEvents } = makeService();

    await service.overrideStatus(
      'session-1',
      { status: SessionStatus.NEEDS_RECONCILIATION, reason: 'divergence', force: true },
      caller,
    );

    expect(realtimeEvents.emitNeedsReconciliation).toHaveBeenCalledWith('session-1');
  });
});
