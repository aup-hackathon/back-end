import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  ActorType,
  ComparisonType,
  DivergenceReportStatus,
  GraphSource,
  GraphType,
  MessageRole,
  MessageType,
  PipelineStatus,
  WorkflowStatus,
} from '../../../database/enums';
import { AgentExecution, PipelineExecution } from '../../agents/entities';
import { AuditService } from '../../audit/audit.service';
import { DivergenceReport, WorkflowGraphSnapshot } from '../../divergence/entities';
import { Message } from '../../messages/entities';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { Session } from '../../sessions/entities';
import { transitionSessionStatus, SessionFsmEvent } from '../../sessions/session-fsm';
import { KGEdge, KGNode, Workflow, WorkflowVersion } from '../../workflows/entities';
import { AiTaskResultEvent } from '../../../core/messaging/events';
import { NatsPublisherService } from '../../../infra/nats/nats.publisher.service';

export interface GenerationCompleteHandlerDeps {
  sessionsRepository: Repository<Session>;
  workflowsRepository: Repository<Workflow>;
  workflowVersionsRepository: Repository<WorkflowVersion>;
  pipelineExecutionsRepository: Repository<PipelineExecution>;
  agentExecutionRepository: Repository<AgentExecution>;
  agentLogRepository: Repository<any>;
  auditService: AuditService;
  messageRepository: Repository<Message>;
  workflowGraphSnapshotRepository: Repository<WorkflowGraphSnapshot>;
  divergenceReportRepository: Repository<DivergenceReport>;
  kgNodeRepository: Repository<KGNode>;
  kgEdgeRepository: Repository<KGEdge>;
  realtimeGateway: RealtimeGateway;
  natsPublisher: NatsPublisherService;
}

@Injectable()
export class GenerationCompleteHandler {
  private readonly handledIds = new Set<string>();

  constructor(private readonly deps: GenerationCompleteHandlerDeps) { }

  async handle(payload: AiTaskResultEvent, msgId?: string | null): Promise<void> {
    const idempotencyKey = this.idempotencyKey(msgId, payload.correlation_id, 'ai.tasks.result');
    if (this.isAlreadyHandled(idempotencyKey)) return;

    const {
      sessionsRepository,
      workflowsRepository,
      workflowVersionsRepository,
      pipelineExecutionsRepository,
      auditService,
      messageRepository,
      workflowGraphSnapshotRepository,
      divergenceReportRepository,
      kgNodeRepository,
      kgEdgeRepository,
      realtimeGateway,
      natsPublisher,
    } = this.deps;

    const pipelineExecution = await pipelineExecutionsRepository.findOne({
      where: { id: payload.pipeline_execution_id, sessionId: payload.session_id },
    });
    if (!pipelineExecution) throw new Error('Pipeline execution not found for ai.tasks.result');

    const session = await sessionsRepository.findOne({ where: { id: payload.session_id } });
    if (!session) throw new Error('Session not found for ai.tasks.result');

    await this.assertOrgMatch(payload.org_id, session.id, sessionsRepository, workflowsRepository);

    const workflow = await workflowsRepository.findOne({ where: { id: session.workflowId } });
    if (!workflow) throw new Error('Workflow not found for ai.tasks.result');

    const source = payload.source ?? 'ai';
    const createdVersion = await this.createWorkflowVersionFromResult(
      payload,
      workflow,
      session,
      workflowVersionsRepository,
    );
    const previousWorkflowVersion = workflow.currentVersion;
    const previousSessionStatus = session.status;

    workflow.currentVersion = createdVersion.versionNumber;
    workflow.status = WorkflowStatus.PENDING_REVIEW;
    await workflowsRepository.save(workflow);

    session.confidenceScore = payload.confidence;
    session.status = transitionSessionStatus(session.status, SessionFsmEvent.AI_RESULT_RECEIVED, session.mode);
    await sessionsRepository.save(session);

    pipelineExecution.status = PipelineStatus.COMPLETED;
    pipelineExecution.finalConfidence = payload.confidence;
    pipelineExecution.completedAt = new Date();
    pipelineExecution.errorSummary = null;
    await pipelineExecutionsRepository.save(pipelineExecution);

    await messageRepository.insert({
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

    await auditService.log({
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

    await this.markWorkflowUpdated(natsPublisher, workflow.id, createdVersion);

    const intentSnapshot = await this.buildIntentSnapshot(
      session,
      workflow.id,
      workflowGraphSnapshotRepository,
      kgNodeRepository,
      kgEdgeRepository,
    );
    const generatedSnapshot = await this.buildGeneratedSnapshot(
      session,
      workflow.id,
      createdVersion,
      workflowGraphSnapshotRepository,
    );

    const divergenceReportId = await this.createDivergenceReport(
      workflow.id,
      pipelineExecution.id,
      intentSnapshot.id,
      generatedSnapshot.id,
      divergenceReportRepository,
    );

    await natsPublisher.publishAiTaskDivergence({
      correlation_id: payload.correlation_id,
      report_id: divergenceReportId,
      graph_a_id: intentSnapshot.id,
      graph_b_id: generatedSnapshot.id,
      comparison_type: ComparisonType.INTENT_VS_GENERATED,
      session_id: session.id,
    });

    realtimeGateway.emitToSession(session.id, 'workflow.updated', {
      workflowId: workflow.id,
      versionNumber: createdVersion.versionNumber,
      confidence: payload.confidence,
    });

    this.markHandled(idempotencyKey);
  }

  private async assertOrgMatch(
    orgId: string | undefined | null,
    sessionId: string,
    sessionsRepository: Repository<Session>,
    workflowsRepository: Repository<Workflow>,
  ): Promise<void> {
    // Skip org validation when the AI service doesn't include org_id in the payload
    if (!orgId) return;

    const session = await sessionsRepository.findOne({ where: { id: sessionId } });
    if (!session) throw new Error('Session not found for org validation');
    const workflow = await workflowsRepository.findOne({ where: { id: session.workflowId } });
    if (!workflow) throw new Error('Workflow not found for org validation');
    if (workflow.orgId !== orgId) {
      throw new Error('org_id mismatch in NATS payload');
    }
  }

  private async createWorkflowVersionFromResult(
    payload: AiTaskResultEvent,
    workflow: Workflow,
    session: Session,
    workflowVersionsRepository: Repository<WorkflowVersion>,
  ): Promise<WorkflowVersion> {
    const currentVersion = await workflowVersionsRepository.findOne({
      where: { workflowId: workflow.id },
      order: { versionNumber: 'DESC' },
    });

    const nextVersionNumber = payload.version_number ?? (currentVersion?.versionNumber ?? 0) + 1;
    const created = workflowVersionsRepository.create({
      workflowId: workflow.id,
      versionNumber: nextVersionNumber,
      elementsJson: payload.workflow_json ?? {},
      elsaJson: payload.elsa_json ?? null,
      confidenceScore: payload.confidence,
      createdBy: session.userId,
    });

    return workflowVersionsRepository.save(created);
  }

  private async markWorkflowUpdated(
    natsPublisher: NatsPublisherService,
    workflowId: string,
    version: WorkflowVersion,
  ): Promise<void> {
    const changedElements = this.computeChangedElements(version.elementsJson);
    await natsPublisher.publishWorkflowUpdated({
      workflow_id: workflowId,
      version_number: version.versionNumber,
      changed_elements: changedElements,
      source: 'ai',
      correlation_id: '',
    });
  }

  private computeChangedElements(
    workflowJson: Record<string, unknown> | unknown,
  ): Array<{ element_id: string; change_type: 'added' | 'removed' | 'modified' }> {
    if (!workflowJson || typeof workflowJson !== 'object') return [];
    const json = workflowJson as Record<string, unknown>;
    const elements = Array.isArray(json.elements) ? (json.elements as Array<Record<string, unknown>>) : [];

    return elements
      .filter((entry) => typeof entry.element_id === 'string')
      .map((entry) => ({ element_id: entry.element_id as string, change_type: 'modified' as const }));
  }

  private async buildIntentSnapshot(
    session: Session,
    workflowId: string,
    workflowGraphSnapshotRepository: Repository<WorkflowGraphSnapshot>,
    kgNodeRepository: Repository<KGNode>,
    kgEdgeRepository: Repository<KGEdge>,
  ): Promise<WorkflowGraphSnapshot> {
    const nodes = await kgNodeRepository.find({ where: { sessionId: session.id } });
    const edges = await kgEdgeRepository.find({ where: { sessionId: session.id } });

    return workflowGraphSnapshotRepository.save(
      workflowGraphSnapshotRepository.create({
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
    workflowGraphSnapshotRepository: Repository<WorkflowGraphSnapshot>,
  ): Promise<WorkflowGraphSnapshot> {
    const json = (version.elementsJson ?? {}) as Record<string, unknown>;
    const nodes = Array.isArray(json.nodes) ? (json.nodes as unknown[]) : [];
    const edges = Array.isArray(json.edges) ? (json.edges as unknown[]) : [];

    return workflowGraphSnapshotRepository.save(
      workflowGraphSnapshotRepository.create({
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
    divergenceReportRepository: Repository<DivergenceReport>,
  ): Promise<string> {
    const report = await divergenceReportRepository.save(
      divergenceReportRepository.create({
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
