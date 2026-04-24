import {
  AgentType,
  ComparisonType,
  PipelineStatus,
  SessionMode,
  SessionStatus,
  WorkflowStatus,
} from '../../database/enums';
import { AIGatewaySubscriberService } from './ai-gateway.subscriber.service';

describe('AIGatewaySubscriberService', () => {
  const makeService = () => {
    const natsClient = {
      ensureStreamAndConsumers: jest.fn().mockResolvedValue(undefined),
      subscribeDurable: jest.fn().mockResolvedValue(undefined),
    };
    const natsPublisher = {
      publishAiTaskDivergence: jest.fn().mockResolvedValue(undefined),
      publishWorkflowUpdated: jest.fn().mockResolvedValue(undefined),
    };
    const dlqService = {
      moveToDlq: jest.fn().mockResolvedValue(undefined),
    };
    const realtimeGateway = {
      emitToSession: jest.fn(),
    };
    const configService = {
      get: jest.fn().mockReturnValue(0.7),
    };

    const sessionsRepository = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce({
          id: 'session-1',
          workflowId: 'workflow-1',
          userId: 'user-1',
          mode: SessionMode.AUTO,
          status: SessionStatus.PROCESSING,
          confidenceScore: 0,
        })
        .mockResolvedValue({
          id: 'session-1',
          workflowId: 'workflow-1',
          userId: 'user-1',
          mode: SessionMode.AUTO,
          status: SessionStatus.PROCESSING,
          confidenceScore: 0,
        }),
      save: jest.fn().mockResolvedValue(undefined),
    };

    const workflowsRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'workflow-1',
        orgId: 'org-1',
        currentVersion: 0,
        status: WorkflowStatus.DRAFT,
      }),
      save: jest.fn().mockResolvedValue(undefined),
    };

    const workflowVersionsRepository = {
      findOne: jest.fn().mockResolvedValue({ versionNumber: 0 }),
      create: jest.fn((value) => ({ id: 'workflow-version-1', ...value })),
      save: jest.fn().mockResolvedValue({
        id: 'workflow-version-1',
        versionNumber: 1,
        elementsJson: {
          elements: [{ element_id: 'node-1' }],
          nodes: [{ id: 'node-1' }],
          edges: [],
        },
      }),
    };

    const pipelineExecutionsRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'pipeline-1',
        sessionId: 'session-1',
        status: PipelineStatus.PENDING,
        totalLlmCalls: 0,
        totalTokensConsumed: 0,
      }),
      save: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue([{ id: 'agent-def-1' }]),
    };

    const agentExecutionRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn().mockResolvedValue(undefined),
    };

    const agentLogRepository = {
      insert: jest.fn().mockResolvedValue(undefined),
    };
    const auditLogRepository = {
      insert: jest.fn().mockResolvedValue(undefined),
    };
    const messageRepository = {
      insert: jest.fn().mockResolvedValue(undefined),
    };
    const workflowGraphSnapshotRepository = {
      create: jest.fn((value) => value),
      save: jest
        .fn()
        .mockResolvedValueOnce({ id: 'intent-snapshot', ...{} })
        .mockResolvedValueOnce({ id: 'generated-snapshot', ...{} }),
    };
    const divergenceReportRepository = {
      create: jest.fn((value) => value),
      save: jest.fn().mockResolvedValue({ id: 'div-report-1' }),
      findOne: jest.fn().mockResolvedValue({ id: 'div-report-1', overallSimilarity: null }),
    };
    const kgNodeRepository = {
      find: jest.fn().mockResolvedValue([{ id: 'kg-node-1', type: 'task', label: 'Task', inferred: false }]),
    };
    const kgEdgeRepository = {
      find: jest.fn().mockResolvedValue([{ id: 'kg-edge-1', fromNodeId: 'kg-node-1', toNodeId: 'kg-node-2', relationType: 'next' }]),
    };

    const service = new AIGatewaySubscriberService(
      natsClient as never,
      natsPublisher as never,
      dlqService as never,
      realtimeGateway as never,
      configService as never,
      sessionsRepository as never,
      workflowsRepository as never,
      workflowVersionsRepository as never,
      pipelineExecutionsRepository as never,
      agentExecutionRepository as never,
      agentLogRepository as never,
      auditLogRepository as never,
      messageRepository as never,
      workflowGraphSnapshotRepository as never,
      divergenceReportRepository as never,
      kgNodeRepository as never,
      kgEdgeRepository as never,
    );

    return {
      service,
      natsClient,
      natsPublisher,
      dlqService,
      realtimeGateway,
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
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('applies ai.tasks.result and publishes workflow update + divergence task', async () => {
    const {
      service,
      natsPublisher,
      workflowsRepository,
      sessionsRepository,
      pipelineExecutionsRepository,
      messageRepository,
      auditLogRepository,
      realtimeGateway,
    } = makeService();

    await service.handleAiTaskResult({
      correlation_id: '11111111-1111-4111-8111-111111111111',
      session_id: 'session-1',
      org_id: 'org-1',
      pipeline_execution_id: 'pipeline-1',
      workflow_json: {
        elements: [{ element_id: 'node-1' }],
        nodes: [{ id: 'node-1' }],
        edges: [],
      },
      confidence: 0.88,
      summary: 'Workflow updated',
    });

    expect(workflowsRepository.save).toHaveBeenCalled();
    expect(sessionsRepository.save).toHaveBeenCalled();
    expect(pipelineExecutionsRepository.save).toHaveBeenCalled();
    expect(messageRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ai_update' }),
    );
    expect(auditLogRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'AI_TASK_RESULT_APPLIED' }),
    );
    expect(natsPublisher.publishWorkflowUpdated).toHaveBeenCalled();
    expect(natsPublisher.publishAiTaskDivergence).toHaveBeenCalledWith(
      expect.objectContaining({ comparison_type: ComparisonType.INTENT_VS_GENERATED }),
    );
    expect(realtimeGateway.emitToSession).toHaveBeenCalledWith(
      'session-1',
      'workflow.updated',
      expect.any(Object),
    );
  });

  it('is idempotent for duplicated ai.tasks.result message id', async () => {
    const { service, workflowsRepository } = makeService();
    const payload = {
      correlation_id: '11111111-1111-4111-8111-111111111111',
      session_id: 'session-1',
      org_id: 'org-1',
      pipeline_execution_id: 'pipeline-1',
      workflow_json: { elements: [], nodes: [], edges: [] },
      confidence: 0.77,
    };

    await service.handleAiTaskResult(payload, 'msg-1');
    await service.handleAiTaskResult(payload, 'msg-1');

    expect(workflowsRepository.save).toHaveBeenCalledTimes(1);
  });

  it('forwards progress events to realtime and persists agent execution/logs', async () => {
    const {
      service,
      agentExecutionRepository,
      agentLogRepository,
      pipelineExecutionsRepository,
      realtimeGateway,
    } = makeService();

    await service.handleAiTaskProgress({
      correlation_id: '22222222-2222-4222-8222-222222222222',
      session_id: 'session-1',
      org_id: 'org-1',
      pipeline_execution_id: 'pipeline-1',
      agent_execution_id: 'agent-exec-1',
      agent_type: AgentType.EXTRACTION,
      agent_name: 'Extraction Agent',
      status: 'RUNNING' as any,
      order_index: 2,
      progress_pct: 45,
      llm_calls_delta: 1,
      tokens_delta: 150,
      log: {
        level: 'INFO' as any,
        message: 'extracting entities',
      },
    });

    expect(agentExecutionRepository.save).toHaveBeenCalled();
    expect(agentLogRepository.insert).toHaveBeenCalled();
    expect(pipelineExecutionsRepository.save).toHaveBeenCalled();
    expect(realtimeGateway.emitToSession).toHaveBeenCalledWith(
      'session-1',
      'pipeline.progress',
      expect.objectContaining({ progressPct: 45 }),
    );
  });

  it('marks pipeline failed and moves message to DLQ on retry exhaustion', async () => {
    const { service, pipelineExecutionsRepository, dlqService, realtimeGateway } = makeService();

    await service.handleRetryExhausted({
      subject: 'ai.tasks.result',
      payload: {
        pipeline_execution_id: 'pipeline-1',
        session_id: 'session-1',
      },
      error: new Error('boom'),
      deliveryCount: 3,
      msgId: 'msg-3',
    });

    expect(pipelineExecutionsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: PipelineStatus.FAILED }),
    );
    expect(dlqService.moveToDlq).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'ai.tasks.result',
        deliveryCount: 3,
      }),
    );
    expect(realtimeGateway.emitToSession).toHaveBeenCalledWith(
      'session-1',
      'pipeline.failed',
      expect.objectContaining({ reason: 'max deliveries reached for ai.tasks.result' }),
    );
  });

  it('updates session to needs_reconciliation when divergence below threshold', async () => {
    const { service, sessionsRepository, realtimeGateway } = makeService();

    await service.handleDivergenceResult({
      correlation_id: '33333333-3333-4333-8333-333333333333',
      report_id: 'div-report-1',
      session_id: 'session-1',
      similarity_score: 0.32,
    });

    expect(sessionsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: SessionStatus.NEEDS_RECONCILIATION }),
    );
    expect(realtimeGateway.emitToSession).toHaveBeenCalledWith(
      'session-1',
      'session.needs_reconciliation',
      expect.objectContaining({ similarityScore: 0.32 }),
    );
  });
});
