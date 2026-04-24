import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CONSUMERS, SUBJECTS } from '../../core/messaging';
import { AiTaskResultEvent, AiTaskProgressEvent, PipelineDivergenceResultEvent, SystemHealthPingEvent } from '../../core/messaging/events';
import { NatsClientService } from '../../infra/nats/nats.client';
import { GenerationCompleteHandler } from './handlers/generation-complete.handler';
import { StreamTokenHandler } from './handlers/stream-token.handler';
import { RetryExhaustedHandler } from './handlers/retry-exhausted.handler';
import { DivergenceResultHandler } from './handlers/divergence-result.handler';
import { AiTaskDlqService } from './dlq/ai-task-dlq.service';
import { AgentExecution, AgentLog, PipelineExecution } from '../agents/entities';
import { AuditLog } from '../audit/entities';
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
  ) {
    this.generationCompleteHandler = new GenerationCompleteHandler({
      sessionsRepository,
      workflowsRepository,
      workflowVersionsRepository,
      pipelineExecutionsRepository,
      agentExecutionRepository,
      agentLogRepository,
      auditLogRepository,
      messageRepository,
      workflowGraphSnapshotRepository,
      divergenceReportRepository,
      kgNodeRepository,
      kgEdgeRepository,
      realtimeGateway,
      natsPublisher: null as any,
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
        await this.generationCompleteHandler.handle(payload as unknown as AiTaskResultEvent);
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
        await this.streamTokenHandler.handle(payload as unknown as AiTaskProgressEvent);
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
}