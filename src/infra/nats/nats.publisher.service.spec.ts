import {
  PipelineTaskType,
  SessionMode,
  AgentType,
  LogLevel,
} from '../database/enums';
import { NatsPublisherService } from './nats.publisher.service';

describe('NatsPublisherService', () => {
  const natsClient = {
    publish: jest.fn().mockResolvedValue(undefined),
  };

  const service = new NatsPublisherService(natsClient as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('publishes ai.tasks.new with idempotent msgId', async () => {
    await service.publishAiTaskNew({
      correlation_id: '11111111-1111-4111-8111-111111111111',
      session_id: '22222222-2222-4222-8222-222222222222',
      org_id: '33333333-3333-4333-8333-333333333333',
      task_type: PipelineTaskType.FULL_PIPELINE,
      mode: SessionMode.AUTO,
      input: { text: 'hello' },
      pipeline_execution_id: '44444444-4444-4444-8444-444444444444',
    });

    expect(natsClient.publish).toHaveBeenCalledWith(
      'ai.tasks.new',
      expect.objectContaining({ task_type: PipelineTaskType.FULL_PIPELINE }),
      '11111111-1111-4111-8111-111111111111:ai.tasks.new:44444444-4444-4444-8444-444444444444',
    );
  });

  it('publishes workflow update events', async () => {
    await service.publishWorkflowUpdated({
      workflow_id: '55555555-5555-4555-8555-555555555555',
      version_number: 5,
      changed_elements: [{ element_id: 'node-1', change_type: 'modified' }],
      source: 'ai',
      correlation_id: '66666666-6666-4666-8666-666666666666',
    });

    expect(natsClient.publish).toHaveBeenCalledWith(
      'workflow.events.updated',
      expect.any(Object),
      '66666666-6666-4666-8666-666666666666:workflow.events.updated:',
    );
  });

  it('publishes divergence task payloads', async () => {
    await service.publishAiTaskDivergence({
      correlation_id: '77777777-7777-4777-8777-777777777777',
      report_id: '88888888-8888-4888-8888-888888888888',
      graph_a_id: '99999999-9999-4999-8999-999999999999',
      graph_b_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      comparison_type: 'INTENT_VS_GENERATED',
      session_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    });

    expect(natsClient.publish).toHaveBeenCalledWith(
      'ai.tasks.divergence',
      expect.objectContaining({ report_id: '88888888-8888-4888-8888-888888888888' }),
      '77777777-7777-4777-8777-777777777777:ai.tasks.divergence:88888888-8888-4888-8888-888888888888',
    );
  });

  it('publishes progress-compatible context event before pipeline', async () => {
    await service.publishAiContextLoad({
      correlation_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      session_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      org_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      active_rules: [{ id: 'rule-1' }],
      skill_ids: ['skill-1'],
    });

    expect(natsClient.publish).toHaveBeenCalledWith(
      'ai.context.load',
      expect.any(Object),
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc:ai.context.load:',
    );
  });

  it('publishes health pings', async () => {
    await service.publishSystemHealthPing({
      service: 'nats',
      status: 'ok',
      latency_ms: 12,
      details: { stream: 'FLOWFORGE' },
      timestamp: '2026-04-24T12:34:56.789Z',
    });

    expect(natsClient.publish).toHaveBeenCalledWith(
      'system.health.ping',
      expect.objectContaining({ service: 'nats' }),
      '2026-04-24T12:34:56.789Z:system.health.ping:',
    );
  });

  it('publishes document preprocess events', async () => {
    await service.publishDocumentPreprocess({
      document_id: '99999999-9999-4999-8999-999999999999',
      file_type: 'application/pdf',
      storage_url: 'minio://documents/sample.pdf',
    });

    expect(natsClient.publish).toHaveBeenCalledWith(
      'document.preprocess',
      expect.objectContaining({ file_type: 'application/pdf' }),
      '99999999-9999-4999-8999-999999999999:document.preprocess:',
    );
  });

  it('validates nested progress payload contract object type', async () => {
    await expect(
      service.publishAiTaskNew({
        correlation_id: '11111111-1111-4111-8111-111111111111',
        session_id: '22222222-2222-4222-8222-222222222222',
        org_id: '33333333-3333-4333-8333-333333333333',
        task_type: PipelineTaskType.QA_ROUND,
        mode: SessionMode.INTERACTIVE,
        input: { log: { level: LogLevel.INFO } },
        pipeline_execution_id: '44444444-4444-4444-8444-444444444444',
        resume_from_checkpoint: AgentType.QA,
      }),
    ).resolves.toBeUndefined();
  });
});
