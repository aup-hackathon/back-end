import { PipelineStatus, PipelineTaskType, SessionMode } from '../../database/enums';
import { RequestContextService } from '../../core/context/request-context.service';
import { AIGatewayService } from './ai-gateway.service';

describe('AIGatewayService', () => {
  const makeService = () => {
    const natsPublisher = {
      publishAiContextLoad: jest.fn().mockResolvedValue(undefined),
      publishAiTaskNew: jest.fn().mockResolvedValue(undefined),
    };
    const pipelineExecutionRepository = {
      create: jest.fn((value) => ({ id: 'pipeline-1', ...value })),
      save: jest
        .fn()
        .mockResolvedValueOnce({ id: 'pipeline-1', status: PipelineStatus.PENDING, natsMessageId: null })
        .mockResolvedValueOnce({
          id: 'pipeline-1',
          status: PipelineStatus.PENDING,
          natsMessageId: 'corr-id:ai.tasks.new:pipeline-1',
        }),
      query: jest.fn().mockResolvedValue([{ orgId: 'org-1' }]),
    };
    const sessionRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'session-1', workflowId: 'workflow-1', mode: SessionMode.AUTO }),
    };
    const rulesService = {
      listActiveRulesForContext: jest.fn().mockResolvedValue([
        {
          id: 'rule-1',
          type: 'EXTRACTION',
          scope: 'ORG',
          target_agent: 'EXTRACTION',
          condition: { source: 'doc' },
          instruction: 'prefer process owner naming',
          priority: 10,
        },
      ]),
    };
    const skillRepository = {
      find: jest.fn().mockResolvedValue([{ id: 'skill-1' }, { id: 'skill-2' }]),
    };
    const requestContextService = new RequestContextService();
    const service = new AIGatewayService(
      natsPublisher as never,
      requestContextService,
      pipelineExecutionRepository as never,
      sessionRepository as never,
      skillRepository as never,
      rulesService as never,
    );

    return {
      service,
      natsPublisher,
      pipelineExecutionRepository,
      sessionRepository,
      rulesService,
      skillRepository,
      requestContextService,
    };
  };

  it('creates a pending pipeline execution and publishes context then task', async () => {
    const { service, natsPublisher, pipelineExecutionRepository, requestContextService } = makeService();

    const result = await requestContextService.run(
      { correlationId: 'corr-id', userId: 'user-1', orgId: 'org-1', role: 'admin' },
      () =>
        service.publishAiTask({
          sessionId: 'session-1',
          taskType: PipelineTaskType.FULL_PIPELINE,
          mode: SessionMode.AUTO,
          input: { message: 'hello' },
          triggeredBy: 'user-1',
        }),
    );

    expect(result).toEqual({
      pipelineExecutionId: 'pipeline-1',
      natsMessageId: 'corr-id:ai.tasks.new:pipeline-1',
    });
    expect(pipelineExecutionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: PipelineStatus.PENDING, sessionId: 'session-1' }),
    );
    expect(natsPublisher.publishAiContextLoad).toHaveBeenCalledWith(
      expect.objectContaining({
        correlation_id: 'corr-id',
        session_id: 'session-1',
        org_id: 'org-1',
        skill_ids: ['skill-1', 'skill-2'],
      }),
    );
    expect(natsPublisher.publishAiTaskNew).toHaveBeenCalledWith(
      expect.objectContaining({
        correlation_id: 'corr-id',
        pipeline_execution_id: 'pipeline-1',
        task_type: PipelineTaskType.FULL_PIPELINE,
      }),
    );
  });

  it('throws when session is missing', async () => {
    const { service, sessionRepository, requestContextService } = makeService();
    sessionRepository.findOne.mockResolvedValueOnce(null);

    await expect(
      requestContextService.run(
        { correlationId: 'corr-id', userId: 'user-1', orgId: 'org-1', role: 'admin' },
        () =>
          service.publishAiTask({
            sessionId: 'missing',
            taskType: PipelineTaskType.FULL_PIPELINE,
            mode: SessionMode.AUTO,
            input: {},
          }),
      ),
    ).rejects.toThrow('Session not found when publishing ai task');
  });
});
