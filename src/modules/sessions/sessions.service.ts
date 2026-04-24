import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ActorType, PipelineStatus, SessionStatus, UserRole } from '../../database/enums';
import { JsonValue } from '../../database/types/json-value.type';
import { NatsPublisherService } from '../../nats/nats.publisher.service';
import { PipelineExecution } from '../agents/entities/pipeline-execution.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { Document } from '../documents/entities/document.entity';
import { Message } from '../messages/entities/message.entity';
import { WorkflowVersion } from '../workflows/entities/workflow-version.entity';
import { Workflow } from '../workflows/entities/workflow.entity';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionModeDto } from './dto/update-session-mode.dto';
import { UpdateSessionStatusDto } from './dto/update-session-status.dto';
import { Session } from './entities/session.entity';
import { canTransitionTo, SessionFsmEvent, transitionSessionStatus } from './session-fsm';
import { SessionRealtimeEventsService } from './session-realtime-events.service';

type RequestUser = {
  id: string;
  orgId: string;
  role: UserRole | string;
};

@Injectable()
export class SessionsService {
  constructor(
    @InjectRepository(Session)
    private readonly sessionsRepository: Repository<Session>,
    @InjectRepository(Workflow)
    private readonly workflowsRepository: Repository<Workflow>,
    @InjectRepository(WorkflowVersion)
    private readonly workflowVersionsRepository: Repository<WorkflowVersion>,
    @InjectRepository(PipelineExecution)
    private readonly pipelineExecutionsRepository: Repository<PipelineExecution>,
    @InjectRepository(Message)
    private readonly messagesRepository: Repository<Message>,
    @InjectRepository(Document)
    private readonly documentsRepository: Repository<Document>,
    @InjectRepository(AuditLog)
    private readonly auditLogsRepository: Repository<AuditLog>,
    private readonly natsPublisher: NatsPublisherService,
    private readonly realtimeEvents: SessionRealtimeEventsService,
  ) {}

  async createSession(dto: CreateSessionDto, caller: RequestUser) {
    const workflow = await this.findWorkflowInOrgOrThrow(dto.workflowId, caller.orgId);
    const session = this.sessionsRepository.create({
      workflowId: workflow.id,
      userId: caller.id,
      mode: dto.mode,
      status: SessionStatus.CREATED,
      confidenceScore: 0,
      finalizedAt: null,
      archivedAt: null,
    });
    const saved = await this.sessionsRepository.save(session);
    return this.serializeSession(saved);
  }

  async getSession(sessionId: string, caller: RequestUser) {
    const session = await this.findSessionInOrgOrThrow(sessionId, caller.orgId);
    return this.serializeSession(session);
  }

  async updateMode(sessionId: string, dto: UpdateSessionModeDto, caller: RequestUser) {
    const session = await this.findSessionInOrgOrThrow(sessionId, caller.orgId);
    this.assertOwnerOrAdmin(session, caller);

    if (session.mode === dto.mode) return this.serializeSession(session);

    const beforeState = { mode: session.mode };
    session.mode = dto.mode;
    const saved = await this.sessionsRepository.save(session);
    await this.insertAuditLog(session.workflowId, caller.id, 'SESSION_MODE_UPDATED', beforeState, {
      mode: saved.mode,
    });
    return this.serializeSession(saved);
  }

  async finalize(sessionId: string, caller: RequestUser) {
    const session = await this.findSessionInOrgOrThrow(sessionId, caller.orgId);
    this.assertOwnerOrAdmin(session, caller);
    await this.findWorkflowInOrgOrThrow(session.workflowId, caller.orgId);

    const beforeStatus = session.status;
    session.status = transitionSessionStatus(
      session.status,
      SessionFsmEvent.USER_FINALIZES,
      session.mode,
    );
    session.finalizedAt = new Date();
    const saved = await this.sessionsRepository.save(session);
    const latestVersion = await this.findLatestWorkflowVersion(session.workflowId);

    await this.insertAuditLog(
      session.workflowId,
      caller.id,
      'SESSION_FINALIZED',
      { status: beforeStatus },
      { status: saved.status, finalized_at: saved.finalizedAt?.toISOString() },
    );
    await this.natsPublisher.publishSessionFinalized({
      session_id: saved.id,
      workflow_id: saved.workflowId,
      final_version_number: latestVersion?.versionNumber ?? 0,
      final_confidence: saved.confidenceScore,
      finalized_at: saved.finalizedAt.toISOString(),
    });

    return this.serializeSession(saved);
  }

  async getWorkflowState(sessionId: string, caller: RequestUser) {
    const session = await this.findSessionInOrgOrThrow(sessionId, caller.orgId);
    const latestVersion = await this.findLatestWorkflowVersion(session.workflowId);
    return {
      sessionId: session.id,
      workflowId: session.workflowId,
      versionNumber: latestVersion?.versionNumber ?? null,
      elementsJson: latestVersion?.elementsJson ?? null,
    };
  }

  async getProgress(sessionId: string, caller: RequestUser) {
    const session = await this.findSessionInOrgOrThrow(sessionId, caller.orgId);
    const latestPipeline = await this.pipelineExecutionsRepository.findOne({
      where: { sessionId: session.id },
      order: { createdAt: 'DESC' },
    });

    return {
      current_agent: latestPipeline?.lastCheckpointAgent ?? null,
      progress_pct: latestPipeline ? this.pipelineProgress(latestPipeline.status) : 0,
      overall_confidence: latestPipeline?.finalConfidence ?? session.confidenceScore,
    };
  }

  async archive(sessionId: string, caller: RequestUser) {
    const session = await this.findSessionInOrgOrThrow(sessionId, caller.orgId);
    this.assertOwnerOrAdmin(session, caller);

    const beforeStatus = session.status;
    session.status = transitionSessionStatus(
      session.status,
      SessionFsmEvent.USER_DELETES,
      session.mode,
    );
    session.archivedAt = new Date();
    const saved = await this.sessionsRepository.save(session);
    await Promise.all([
      this.messagesRepository.update({ sessionId: session.id }, { archivedAt: saved.archivedAt }),
      this.documentsRepository.update({ sessionId: session.id }, { archivedAt: saved.archivedAt }),
      this.pipelineExecutionsRepository.update(
        { sessionId: session.id },
        { archivedAt: saved.archivedAt },
      ),
    ]);
    await this.insertAuditLog(
      session.workflowId,
      caller.id,
      'SESSION_ARCHIVED',
      { status: beforeStatus },
      { status: saved.status, archived_at: saved.archivedAt?.toISOString() },
    );

    return this.serializeSession(saved);
  }

  async overrideStatus(sessionId: string, dto: UpdateSessionStatusDto, caller: RequestUser) {
    this.assertAdmin(caller);
    const session = await this.findSessionInOrgOrThrow(sessionId, caller.orgId);

    if (!dto.force && !canTransitionTo(session.status, dto.status, session.mode)) {
      throw new ConflictException('Target status violates the session FSM');
    }

    const beforeStatus = session.status;
    session.status = dto.status;
    if (dto.status === SessionStatus.ARCHIVED) session.archivedAt = new Date();
    if (dto.status === SessionStatus.DRAFT_READY && !session.finalizedAt) {
      session.finalizedAt = new Date();
    }
    const saved = await this.sessionsRepository.save(session);
    if (saved.status === SessionStatus.NEEDS_RECONCILIATION) {
      this.realtimeEvents.emitNeedsReconciliation(saved.id);
    }

    await this.insertAuditLog(
      session.workflowId,
      caller.id,
      'SESSION_STATUS_OVERRIDDEN',
      { status: beforeStatus },
      { status: saved.status, reason: dto.reason, force: dto.force === true },
    );
    return this.serializeSession(saved);
  }

  private async findSessionInOrgOrThrow(sessionId: string, orgId: string): Promise<Session> {
    const session = await this.sessionsRepository.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');

    await this.findWorkflowInOrgOrThrow(session.workflowId, orgId, 'Session not found');
    return session;
  }

  private async findWorkflowInOrgOrThrow(
    workflowId: string,
    orgId: string,
    message = 'Workflow not found',
  ): Promise<Workflow> {
    const workflow = await this.workflowsRepository.findOne({ where: { id: workflowId, orgId } });
    if (!workflow) throw new NotFoundException(message);
    return workflow;
  }

  private findLatestWorkflowVersion(workflowId: string): Promise<WorkflowVersion | null> {
    return this.workflowVersionsRepository.findOne({
      where: { workflowId },
      order: { versionNumber: 'DESC' },
    });
  }

  private assertOwnerOrAdmin(session: Session, caller: RequestUser): void {
    if (caller.role === UserRole.ADMIN) return;
    if (session.userId !== caller.id) {
      throw new ForbiddenException('Only the session owner or an admin can manage this session');
    }
  }

  private assertAdmin(caller: RequestUser): void {
    if (caller.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Admin role is required');
    }
  }

  private pipelineProgress(status: PipelineStatus): number {
    if (status === PipelineStatus.COMPLETED) return 100;
    if (status === PipelineStatus.RUNNING) return 50;
    if (status === PipelineStatus.PAUSED) return 50;
    if (status === PipelineStatus.FAILED || status === PipelineStatus.CANCELLED) return 100;
    return 0;
  }

  private insertAuditLog(
    workflowId: string,
    actorId: string,
    eventType: string,
    beforeState: JsonValue | null,
    afterState: JsonValue | null,
  ) {
    return this.auditLogsRepository.insert({
      workflowId,
      actorId,
      actorType: ActorType.USER,
      eventType,
      beforeState,
      afterState,
    });
  }

  private serializeSession(session: Session) {
    return {
      id: session.id,
      workflowId: session.workflowId,
      userId: session.userId,
      mode: session.mode,
      status: session.status,
      confidenceScore: session.confidenceScore,
      createdAt: session.createdAt,
      finalizedAt: session.finalizedAt,
      archivedAt: session.archivedAt,
    };
  }
}
