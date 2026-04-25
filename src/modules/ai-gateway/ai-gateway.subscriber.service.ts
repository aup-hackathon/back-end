import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CONSUMERS, SUBJECTS } from '../../core/messaging';
import { AiTaskResultEvent, AiTaskProgressEvent, PipelineDivergenceResultEvent, SystemHealthPingEvent } from '../../core/messaging/events';
import { NatsClientService } from '../../infra/nats/nats.client';
import { NatsPublisherService } from '../../infra/nats/nats.publisher.service';
import { GenerationCompleteHandler } from './handlers/generation-complete.handler';
import { StreamTokenHandler } from './handlers/stream-token.handler';
import { RetryExhaustedHandler } from './handlers/retry-exhausted.handler';
import { DivergenceResultHandler } from './handlers/divergence-result.handler';
import { AiTaskDlqService } from './dlq/ai-task-dlq.service';
import { AgentExecution, AgentLog, PipelineExecution } from '../agents/entities';
import { AuditService } from '../audit/audit.service';
import { DivergenceReport, WorkflowGraphSnapshot } from '../divergence/entities';
import { Message } from '../messages/entities';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { Session } from '../sessions/entities';
import { KGEdge, KGNode, Workflow, WorkflowVersion } from '../workflows/entities';

@Injectable()
export class AIGatewaySubscriberService implements OnModuleInit {
  private readonly logger = new Logger(AIGatewaySubscriberService.name);

  private readonly generationCompleteHandler: GenerationCompleteHandler;
  private readonly streamTokenHandler: StreamTokenHandler;
  private readonly divergenceResultHandler: DivergenceResultHandler;
  private readonly retryExhaustedHandler: RetryExhaustedHandler;

  constructor(
    private readonly natsClient: NatsClientService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly configService: ConfigService,
    private readonly aiTaskDlqService: AiTaskDlqService,
    private readonly natsPublisher: NatsPublisherService,
    private readonly auditService: AuditService,
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
  ) {
    this.generationCompleteHandler = new GenerationCompleteHandler({
      sessionsRepository,
      workflowsRepository,
      workflowVersionsRepository,
      pipelineExecutionsRepository,
      agentExecutionRepository,
      agentLogRepository,
      auditService,
      messageRepository,
      workflowGraphSnapshotRepository,
      divergenceReportRepository,
      kgNodeRepository,
      kgEdgeRepository,
      realtimeGateway,
      natsPublisher,
    });

    this.streamTokenHandler = new StreamTokenHandler({
      sessionsRepository,
      workflowsRepository,
      pipelineExecutionsRepository,
      agentExecutionRepository,
      agentLogRepository,
      realtimeGateway,
    });

    this.divergenceResultHandler = new DivergenceResultHandler({
      divergenceReportRepository,
      sessionsRepository,
      realtimeGateway,
      configService,
    });

    this.retryExhaustedHandler = new RetryExhaustedHandler({
      pipelineExecutionsRepository,
      realtimeGateway,
      dlqService: aiTaskDlqService,
    });
  }

  async onModuleInit(): Promise<void> {
    await this.natsClient.subscribeDurable({
      subject: SUBJECTS.AI_TASKS_RESULT,
      durableName: CONSUMERS.AI_RESULT,
      handler: async (payload) => {
        const enriched = await this.enrichResultPayload(payload);
        await this.generationCompleteHandler.handle(enriched);
      },
      onExhausted: async (params) => {
        await this.retryExhaustedHandler.handle({
          subject: SUBJECTS.AI_TASKS_RESULT,
          payload: params.payload,
          error: params.error,
          deliveryCount: params.deliveryCount,
          msgId: params.msgId,
        });
      },
    });

    await this.natsClient.subscribeDurable({
      subject: SUBJECTS.AI_TASKS_PROGRESS,
      durableName: CONSUMERS.AI_PROGRESS,
      handler: async (payload) => {
        // The Python AI service sends a simplified progress payload:
        //   { session_id, agent_name, status, progress_pct, message }
        // which is incompatible with StreamTokenHandler's expected schema.
        // Emit directly to the realtime gateway instead.
        const sessionId = payload.session_id as string;
        if (sessionId) {
          this.realtimeGateway.emitToSession(sessionId, 'pipeline.progress', {
            agentName: payload.agent_name ?? 'pipeline',
            status: payload.status ?? 'running',
            progressPct: payload.progress_pct ?? 0,
            message: payload.message ?? '',
          });
        }
      },
      onExhausted: async (params) => {
        await this.retryExhaustedHandler.handle({
          subject: SUBJECTS.AI_TASKS_PROGRESS,
          payload: params.payload,
          error: params.error,
          deliveryCount: params.deliveryCount,
          msgId: params.msgId,
        });
      },
    });

    await this.natsClient.subscribeDurable({
      subject: SUBJECTS.AI_TASKS_DIVERGENCE_RESULT,
      durableName: CONSUMERS.DIVERGENCE_RESULT,
      handler: async (payload) => {
        await this.divergenceResultHandler.handle(payload as unknown as PipelineDivergenceResultEvent);
      },
      onExhausted: async (params) => {
        await this.retryExhaustedHandler.handle({
          subject: SUBJECTS.AI_TASKS_DIVERGENCE_RESULT,
          payload: params.payload,
          error: params.error,
          deliveryCount: params.deliveryCount,
          msgId: params.msgId,
        });
      },
    });

    await this.natsClient.subscribeDurable({
      subject: SUBJECTS.SYSTEM_HEALTH_PING,
      durableName: CONSUMERS.HEALTH_PING,
      handler: async (payload: Record<string, unknown>) => {
        const event = payload as unknown as SystemHealthPingEvent;
        this.logger.log(`health ping received from ${event.service} status=${event.status}`);
      },
      onExhausted: async (params) => {
        await this.retryExhaustedHandler.handle({
          subject: SUBJECTS.SYSTEM_HEALTH_PING,
          payload: params.payload,
          error: params.error,
          deliveryCount: params.deliveryCount,
          msgId: params.msgId,
        });
      },
    });
  }

  /**
   * The Python AI service (flou2flow) sends a simplified result payload:
   *   { session_id, workflow_json, elements_json, ai_summary, confidence, questions }
   *
   * The GenerationCompleteHandler expects the full AiTaskResultEvent:
   *   { correlation_id, session_id, org_id, pipeline_execution_id, workflow_json, confidence, summary, ... }
   *
   * This method enriches the payload by looking up the latest pipeline execution
   * for the given session and filling in the missing fields.
   */
  private async enrichResultPayload(payload: Record<string, unknown>): Promise<AiTaskResultEvent> {
    const sessionId = payload.session_id as string;

    // Look up the latest pipeline execution for this session
    const latestPipeline = await this.pipelineExecutionsRepository.findOne({
      where: { sessionId },
      order: { createdAt: 'DESC' },
    });

    // Look up the session to get the workflow, then the org_id
    const session = await this.sessionsRepository.findOne({ where: { id: sessionId } });
    let orgId = '';
    if (session) {
      const workflow = await this.workflowsRepository.findOne({ where: { id: session.workflowId } });
      orgId = workflow?.orgId ?? '';
    }

    return {
      correlation_id: (payload.correlation_id as string) ?? latestPipeline?.natsMessageId ?? `enriched-${Date.now()}`,
      session_id: sessionId,
      org_id: orgId,
      pipeline_execution_id: (payload.pipeline_execution_id as string) ?? latestPipeline?.id ?? '',
      workflow_json: (payload.workflow_json as Record<string, unknown>) ?? (payload.elements_json as Record<string, unknown>) ?? {},
      confidence: (payload.confidence as number) ?? 0,
      summary: (payload.ai_summary as string) ?? (payload.summary as string) ?? 'AI pipeline completed',
      source: (payload.source as 'ai') ?? 'ai',
    };
  }
}
