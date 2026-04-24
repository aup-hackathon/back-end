import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  ActorType,
  AgentExecutionStatus,
  AgentType,
  ComparisonType,
  DivergenceReportStatus,
  GraphSource,
  GraphType,
  MessageRole,
  MessageType,
  PipelineStatus,
  SessionStatus,
  WorkflowStatus,
} from '../../database/enums';
import { AgentExecution, AgentLog, PipelineExecution } from '../agents/entities';
import { AuditLog } from '../audit/entities';
import { DivergenceReport, WorkflowGraphSnapshot } from '../divergence/entities';
import { Message } from '../messages/entities';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { Session } from '../sessions/entities';
import { transitionSessionStatus, SessionFsmEvent } from '../sessions/session-fsm';
import { KGEdge, KGNode, Workflow, WorkflowVersion } from '../workflows/entities';
import {
  AiTaskProgressPayload,
  AiTaskResultPayload,
  CONSUMERS,
  PipelineDivergenceResultPayload,
  SUBJECTS,
  SystemHealthPingPayload,
  WorkflowUpdatedPayload,
} from '../../nats/contracts';
import { DlqService } from '../../nats/dlq.service';
import { NatsClientService } from '../../nats/nats.client';
import { NatsPublisherService } from '../../nats/nats.publisher.service';

@Injectable()
export class AIGatewaySubscriberService implements OnModuleInit {
  private readonly logger = new Logger(AIGatewaySubscriberService.name);
  private readonly handledIds = new Set<string>();

  constructor(
    private readonly natsClient: NatsClientService,
    private readonly natsPublisher: NatsPublisherService,
    private readonly dlqService: DlqService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly configService: ConfigService,
    @InjectRepository(Session)
    private readonly sessionsRepository: Repository<Session>,
    @InjectRepository(Workflow)
    private readonly workflowsRepository: Repository<Workflow>,
    @InjectRepository(WorkflowVersion)
    private readonly workflowVersionsRepository: Repository<WorkflowVersion>,
    @InjectRepository(PipelineExecution)
    private readonly pipelineExecutionsRepository: Repository<PipelineExecution>,
    @InjectRepository(AgentExecution)
    private readonly agentExecutionRepository: Repository<AgentExecution>,
    @InjectRepository(AgentLog)
    private readonly agentLogRepository: Repository<AgentLog>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
    @InjectRepository(WorkflowGraphSnapshot)
    private readonly workflowGraphSnapshotRepository: Repository<WorkflowGraphSnapshot>,
    @InjectRepository(DivergenceReport)
    private readonly divergenceReportRepository: Repository<DivergenceReport>,
    @InjectRepository(KGNode)
    private readonly kgNodeRepository: Repository<KGNode>,
    @InjectRepository(KGEdge)
    private readonly kgEdgeRepository: Repository<KGEdge>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.natsClient.subscribeDurable({
      subject: SUBJECTS.AI_TASKS_RESULT,
      durableName: CONSUMERS.AI_RESULT,
      payloadType: AiTaskResultPayload as any,
      handler: async (payload, meta) => {
        await this.handleAiTaskResult(payload as unknown as AiTaskResultPayload, meta.msgId);
      },
      onExhausted: async ({ payload, error, deliveryCount, msgId }) => {
        await this.handleRetryExhausted({
          payload,
          subject: SUBJECTS.AI_TASKS_RESULT,
          error,
          deliveryCount,
          msgId,
        });
      },
    });

    await this.natsClient.subscribeDurable({
      subject: SUBJECTS.AI_TASKS_PROGRESS,
      durableName: CONSUMERS.AI_PROGRESS,
      payloadType: AiTaskProgressPayload as any,
      handler: async (payload, meta) => {
        await this.handleAiTaskProgress(payload as unknown as AiTaskProgressPayload, meta.msgId);
      },
      onExhausted: async ({ payload, error, deliveryCount, msgId }) => {
        await this.handleRetryExhausted({
          payload,
          subject: SUBJECTS.AI_TASKS_PROGRESS,
          error,
          deliveryCount,
          msgId,
        });
      },
    });

    await this.natsClient.subscribeDurable({
      subject: SUBJECTS.AI_TASKS_DIVERGENCE_RESULT,
      durableName: CONSUMERS.DIVERGENCE_RESULT,
      payloadType: PipelineDivergenceResultPayload as any,
      handler: async (payload, meta) => {
        await this.handleDivergenceResult(payload as unknown as PipelineDivergenceResultPayload, meta.msgId);
      },
      onExhausted: async ({ payload, error, deliveryCount, msgId }) => {
        await this.handleRetryExhausted({
          payload,
          subject: SUBJECTS.AI_TASKS_DIVERGENCE_RESULT,
          error,
          deliveryCount,
          msgId,
        });
      },
    });

    await this.natsClient.subscribeDurable({
      subject: SUBJECTS.SYSTEM_HEALTH_PING,
      durableName: CONSUMERS.HEALTH_PING,
      payloadType: SystemHealthPingPayload as any,
      handler: async (payload) => {
        this.logger.log(`health ping received from ${payload.service} status=${payload.status}`);
      },
      onExhausted: async ({ payload, error, deliveryCount, msgId }) => {
        await this.handleRetryExhausted({
          payload,
          subject: SUBJECTS.SYSTEM_HEALTH_PING,
          error,
          deliveryCount,
          msgId,
        });
      },
    });
  }

  async handleAiTaskResult(payload: AiTaskResultPayload, msgId?: string | null): Promise<void> {
    const idempotencyKey = this.idempotencyKey(msgId, payload.correlation_id, SUBJECTS.AI_TASKS_RESULT);
    if (this.isAlreadyHandled(idempotencyKey)) return;

    const pipelineExecution = await this.pipelineExecutionsRepository.findOne({
      where: { id: payload.pipeline_execution_id, sessionId: payload.session_id },
    });
    if (!pipelineExecution) throw new Error('Pipeline execution not found for ai.tasks.result');

    const session = await this.sessionsRepository.findOne({ where: { id: payload.session_id } });
    if (!session) throw new Error('Session not found for ai.tasks.result');
    await this.assertOrgMatch(payload.org_id, session.id);

    const workflow = await this.workflowsRepository.findOne({ where: { id: session.workflowId } });
    if (!workflow) throw new Error('Workflow not found for ai.tasks.result');

    const source = payload.source ?? 'ai';
    const createdVersion = await this.createWorkflowVersionFromResult(payload, workflow, session);
    const previousWorkflowVersion = workflow.currentVersion;
    const previousSessionStatus = session.status;

    workflow.currentVersion = createdVersion.versionNumber;
    workflow.status = WorkflowStatus.PENDING_REVIEW;
    await this.workflowsRepository.save(workflow);

    session.confidenceScore = payload.confidence;
    session.status = transitionSessionStatus(session.status, SessionFsmEvent.AI_RESULT_RECEIVED, session.mode);
    await this.sessionsRepository.save(session);

    pipelineExecution.status = PipelineStatus.COMPLETED;
    pipelineExecution.finalConfidence = payload.confidence;
    pipelineExecution.completedAt = new Date();
    pipelineExecution.errorSummary = null;
    await this.pipelineExecutionsRepository.save(pipelineExecution);

    await this.messageRepository.insert({
      sessionId: session.id,
      role: MessageRole.AI,
      type: MessageType.AI_UPDATE,
      content: payload.summary ?? 'AI pipeline completed and workflow updated',
      metadata: {
        correlation_id: payload.correlation_id,
        version_number: createdVersion.versionNumber,
      },
      archivedAt: null,
    });

    await this.auditLogRepository.insert({
      workflowId: workflow.id,
      actorId: null,
      actorType: ActorType.AI_AGENT,
      eventType: 'AI_TASK_RESULT_APPLIED',
      beforeState: {
        workflow_current_version: previousWorkflowVersion,
        session_status: previousSessionStatus,
      },
      afterState: {
        workflow_current_version: workflow.currentVersion,
        session_status: session.status,
        confidence: payload.confidence,
      },
    });

    await this.markWorkflowUpdated(
      workflow.id,
      createdVersion.versionNumber,
      this.computeChangedElements(createdVersion.elementsJson),
      source,
      payload.correlation_id,
      null,
    );

    const intentSnapshot = await this.buildIntentSnapshot(session, workflow.id);
    const generatedSnapshot = await this.buildGeneratedSnapshot(session, workflow.id, createdVersion);

    const divergenceReportId = await this.createDivergenceReport(
      workflow.id,
      pipelineExecution.id,
      intentSnapshot.id,
      generatedSnapshot.id,
    );

    await this.natsPublisher.publishAiTaskDivergence({
      correlation_id: payload.correlation_id,
      report_id: divergenceReportId,
      graph_a_id: intentSnapshot.id,
      graph_b_id: generatedSnapshot.id,
      comparison_type: ComparisonType.INTENT_VS_GENERATED,
      session_id: session.id,
    });

    this.realtimeGateway.emitToSession(session.id, 'workflow.updated', {
      workflowId: workflow.id,
      versionNumber: createdVersion.versionNumber,
      confidence: payload.confidence,
    });

    this.markHandled(idempotencyKey);
  }

  async handleAiTaskProgress(payload: AiTaskProgressPayload, msgId?: string | null): Promise<void> {
    const idempotencyKey = this.idempotencyKey(msgId, payload.correlation_id, SUBJECTS.AI_TASKS_PROGRESS);
    if (this.isAlreadyHandled(idempotencyKey)) return;

    const pipelineExecution = await this.pipelineExecutionsRepository.findOne({
      where: { id: payload.pipeline_execution_id, sessionId: payload.session_id },
    });
    if (!pipelineExecution) throw new Error('Pipeline execution not found for ai.tasks.progress');

    await this.assertOrgMatch(payload.org_id, payload.session_id);

    const existingAgentExecution = await this.agentExecutionRepository.findOne({
      where: { id: payload.agent_execution_id, pipelineExecutionId: payload.pipeline_execution_id },
    });

    const agentExecution =
      existingAgentExecution ??
      this.agentExecutionRepository.create({
        id: payload.agent_execution_id,
        pipelineExecutionId: payload.pipeline_execution_id,
        agentDefinitionId: await this.resolveAgentDefinitionId(payload.agent_type),
        status: payload.status,
        orderIndex: payload.order_index,
        inputSnapshot: null,
        outputSnapshot: null,
        confidenceInput: payload.confidence_input ?? null,
        confidenceOutput: payload.confidence_output ?? null,
        llmCallsCount: 0,
        tokensConsumed: 0,
        errorMessage: payload.error_message ?? null,
        durationMs: null,
        startedAt: payload.started_at ? new Date(payload.started_at) : null,
        completedAt: payload.completed_at ? new Date(payload.completed_at) : null,
      });

    agentExecution.status = payload.status;
    agentExecution.orderIndex = payload.order_index;
    if (payload.confidence_input != null) agentExecution.confidenceInput = payload.confidence_input;
    if (payload.confidence_output != null) agentExecution.confidenceOutput = payload.confidence_output;
    if (payload.llm_calls_delta != null) {
      agentExecution.llmCallsCount = Math.max(0, agentExecution.llmCallsCount + payload.llm_calls_delta);
      pipelineExecution.totalLlmCalls = Math.max(0, pipelineExecution.totalLlmCalls + payload.llm_calls_delta);
    }
    if (payload.tokens_delta != null) {
      agentExecution.tokensConsumed = Math.max(0, agentExecution.tokensConsumed + payload.tokens_delta);
      pipelineExecution.totalTokensConsumed = Math.max(
        0,
        pipelineExecution.totalTokensConsumed + payload.tokens_delta,
      );
    }
    if (payload.started_at) agentExecution.startedAt = new Date(payload.started_at);
    if (payload.completed_at) agentExecution.completedAt = new Date(payload.completed_at);
    if (payload.error_message) agentExecution.errorMessage = payload.error_message;

    await this.agentExecutionRepository.save(agentExecution);

    if (payload.log) {
      await this.agentLogRepository.insert({
        agentExecutionId: agentExecution.id,
        logLevel: payload.log.level,
        message: payload.log.message,
        metadata: payload.log.metadata ?? {},
      });
    }

    pipelineExecution.lastCheckpointAgent = payload.agent_type as AgentType;
    pipelineExecution.status = payload.status === AgentExecutionStatus.FAILED ? PipelineStatus.PAUSED : PipelineStatus.RUNNING;
    if (!pipelineExecution.startedAt) pipelineExecution.startedAt = new Date();
    if (payload.status === AgentExecutionStatus.COMPLETED || payload.status === AgentExecutionStatus.FAILED) {
      pipelineExecution.completedAt = null;
    }
    await this.pipelineExecutionsRepository.save(pipelineExecution);

    this.realtimeGateway.emitToSession(payload.session_id, 'pipeline.progress', {
      pipelineExecutionId: payload.pipeline_execution_id,
      agentExecutionId: payload.agent_execution_id,
      agentType: payload.agent_type,
      status: payload.status,
      progressPct: payload.progress_pct,
    });

    this.markHandled(idempotencyKey);
  }

  async handleDivergenceResult(
    payload: PipelineDivergenceResultPayload,
    msgId?: string | null,
  ): Promise<void> {
    const idempotencyKey = this.idempotencyKey(
      msgId,
      payload.correlation_id,
      SUBJECTS.AI_TASKS_DIVERGENCE_RESULT,
    );
    if (this.isAlreadyHandled(idempotencyKey)) return;

    const report = await this.divergenceReportRepository.findOne({ where: { id: payload.report_id } });
    if (!report) throw new Error('Divergence report not found');

    const threshold = this.configService.get<number>('divergence.threshold', 0.7);
    report.overallSimilarity = payload.similarity_score;
    await this.divergenceReportRepository.save(report);

    if (payload.similarity_score < threshold) {
      const session = await this.sessionsRepository.findOne({ where: { id: payload.session_id } });
      if (session) {
        session.status = SessionStatus.NEEDS_RECONCILIATION;
        await this.sessionsRepository.save(session);
        this.realtimeGateway.emitToSession(session.id, 'session.needs_reconciliation', {
          similarityScore: payload.similarity_score,
          threshold,
        });
      }
    }

    this.markHandled(idempotencyKey);
  }

  async handleRetryExhausted(params: {
    subject: string;
    payload: Record<string, unknown>;
    error: unknown;
    deliveryCount: number;
    msgId?: string | null;
  }): Promise<void> {
    const pipelineExecutionId = (params.payload.pipeline_execution_id ?? null) as string | null;
    const sessionId = (params.payload.session_id ?? null) as string | null;
    const reason = `max deliveries reached for ${params.subject}`;
    const lastError = params.error instanceof Error ? params.error.message : String(params.error);

    if (pipelineExecutionId) {
      const pipelineExecution = await this.pipelineExecutionsRepository.findOne({
        where: { id: pipelineExecutionId },
      });
      if (pipelineExecution) {
        pipelineExecution.status = PipelineStatus.FAILED;
        pipelineExecution.errorSummary = lastError;
        pipelineExecution.completedAt = new Date();
        await this.pipelineExecutionsRepository.save(pipelineExecution);
      }
    }

    if (sessionId) {
      this.realtimeGateway.emitToSession(sessionId, 'pipeline.failed', {
        subject: params.subject,
        reason,
        lastError,
      });
    }

    await this.dlqService.moveToDlq({
      subject: params.subject,
      payload: params.payload,
      reason,
      deliveryCount: params.deliveryCount,
      lastError,
      msgId: params.msgId,
    });
  }

  async markWorkflowUpdated(
    workflowId: string,
    versionNumber: number,
    changedElements: Array<{ element_id: string; change_type: 'added' | 'removed' | 'modified' }>,
    source: 'ai' | 'user' | 'comment_injection' | 'reconciliation',
    correlationId: string,
    actorId?: string | null,
  ): Promise<void> {
    const payload: WorkflowUpdatedPayload = {
      workflow_id: workflowId,
      version_number: versionNumber,
      changed_elements: changedElements,
      source,
      correlation_id: correlationId,
      ...(actorId ? { actor_id: actorId } : {}),
    };
    await this.natsPublisher.publishWorkflowUpdated(payload);
  }

  private async assertOrgMatch(orgId: string, sessionId: string): Promise<void> {
    const session = await this.sessionsRepository.findOne({ where: { id: sessionId } });
    if (!session) throw new Error('Session not found for org validation');
    const workflow = await this.workflowsRepository.findOne({ where: { id: session.workflowId } });
    if (!workflow) throw new Error('Workflow not found for org validation');
    if (workflow.orgId !== orgId) {
      throw new Error('org_id mismatch in NATS payload');
    }
  }

  private async createWorkflowVersionFromResult(
    payload: AiTaskResultPayload,
    workflow: Workflow,
    session: Session,
  ): Promise<WorkflowVersion> {
    const currentVersion = await this.workflowVersionsRepository.findOne({
      where: { workflowId: workflow.id },
      order: { versionNumber: 'DESC' },
    });

    const nextVersionNumber = payload.version_number ?? (currentVersion?.versionNumber ?? 0) + 1;
    const created = this.workflowVersionsRepository.create({
      workflowId: workflow.id,
      versionNumber: nextVersionNumber,
      elementsJson: payload.workflow_json ?? {},
      elsaJson: payload.elsa_json ?? null,
      confidenceScore: payload.confidence,
      createdBy: session.userId,
    });

    return this.workflowVersionsRepository.save(created);
  }

  private computeChangedElements(
    workflowJson: Record<string, unknown> | unknown,
  ): Array<{ element_id: string; change_type: 'added' | 'removed' | 'modified' }> {
    if (!workflowJson || typeof workflowJson !== 'object') return [];
    const json = workflowJson as Record<string, unknown>;
    const elements = Array.isArray(json.elements)
      ? (json.elements as Array<Record<string, unknown>>)
      : [];

    return elements
      .filter((entry) => typeof entry.element_id === 'string')
      .map((entry) => ({ element_id: entry.element_id as string, change_type: 'modified' as const }));
  }

  private async buildIntentSnapshot(session: Session, workflowId: string): Promise<WorkflowGraphSnapshot> {
    const nodes = await this.kgNodeRepository.find({ where: { sessionId: session.id } });
    const edges = await this.kgEdgeRepository.find({ where: { sessionId: session.id } });

    return this.workflowGraphSnapshotRepository.save(
      this.workflowGraphSnapshotRepository.create({
        workflowId,
        workflowVersionId: null,
        sessionId: session.id,
        graphType: GraphType.INTENT,
        source: GraphSource.AI_EXTRACTION,
        nodes: nodes.map((node) => ({
          id: node.id,
          type: node.type,
          label: node.label,
          inferred: node.inferred,
        })),
        edges: edges.map((edge) => ({
          id: edge.id,
          from: edge.fromNodeId,
          to: edge.toNodeId,
          relationType: edge.relationType,
        })),
        nodeCount: nodes.length,
        edgeCount: edges.length,
        graphEmbedding: null,
        createdBy: session.userId,
      }),
    );
  }

  private async buildGeneratedSnapshot(
    session: Session,
    workflowId: string,
    version: WorkflowVersion,
  ): Promise<WorkflowGraphSnapshot> {
    const json = (version.elementsJson ?? {}) as Record<string, unknown>;
    const nodes = Array.isArray(json.nodes) ? (json.nodes as unknown[]) : [];
    const edges = Array.isArray(json.edges) ? (json.edges as unknown[]) : [];

    return this.workflowGraphSnapshotRepository.save(
      this.workflowGraphSnapshotRepository.create({
        workflowId,
        workflowVersionId: version.id,
        sessionId: session.id,
        graphType: GraphType.GENERATED,
        source: GraphSource.AI_GENERATION,
        nodes,
        edges,
        nodeCount: nodes.length,
        edgeCount: edges.length,
        graphEmbedding: null,
        createdBy: session.userId,
      }),
    );
  }

  private async createDivergenceReport(
    workflowId: string,
    pipelineExecutionId: string,
    graphAId: string,
    graphBId: string,
  ): Promise<string> {
    const report = await this.divergenceReportRepository.save(
      this.divergenceReportRepository.create({
        workflowId,
        graphAId,
        graphBId,
        comparisonType: ComparisonType.INTENT_VS_GENERATED,
        status: DivergenceReportStatus.PENDING,
        overallSimilarity: null,
        severity: null,
        algorithmUsed: null,
        totalPoints: 0,
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        autoTriggered: true,
        triggeredBy: null,
        pipelineExecutionId,
        completedAt: null,
      }),
    );

    return report.id;
  }

  private async resolveAgentDefinitionId(agentType: AgentType): Promise<string> {
    const row = await this.pipelineExecutionsRepository.query(
      `SELECT id FROM agent_definition WHERE agent_type = $1 ORDER BY created_at ASC LIMIT 1`,
      [agentType],
    );
    if (!row?.[0]?.id) {
      throw new Error(`Agent definition missing for ${agentType}`);
    }
    return row[0].id as string;
  }

  private idempotencyKey(msgId: string | null | undefined, correlationId: string, subject: string): string {
    return `${msgId ?? ''}:${correlationId}:${subject}`;
  }

  private isAlreadyHandled(key: string): boolean {
    return this.handledIds.has(key);
  }

  private markHandled(key: string): void {
    this.handledIds.add(key);
    if (this.handledIds.size > 10_000) {
      const first = this.handledIds.values().next().value;
      if (first) this.handledIds.delete(first);
    }
  }
}
