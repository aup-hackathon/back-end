import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { NatsWsBridgeService } from '../services/nats-ws-bridge.service';
import { NatsClientService } from '../../../infra/nats/nats.client';
import { RealtimeGateway } from '../realtime.gateway';
import { Document } from '../../documents/entities/document.entity';
import { WS_EVENTS } from '../constants/ws-events.constants';

describe('NatsWsBridgeService', () => {
  let bridge: NatsWsBridgeService;
  let natsClient: jest.Mocked<NatsClientService>;
  let gateway: jest.Mocked<RealtimeGateway>;
  let documentRepo: { findOne: jest.Mock };
  const handlers = new Map<string, (p: any) => Promise<void>>();

  beforeEach(async () => {
    handlers.clear();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NatsWsBridgeService,
        {
          provide: NatsClientService,
          useValue: {
            subscribeDurable: jest.fn().mockImplementation((o: any) => {
              handlers.set(o.subject, o.handler);
              return Promise.resolve();
            }),
          },
        },
        {
          provide: RealtimeGateway,
          useValue: {
            emitToSession: jest.fn(),
            emitToPipeline: jest.fn(),
            emitToWorkflow: jest.fn(),
            emitToAdminHealth: jest.fn(),
            hasListeners: jest.fn().mockReturnValue(true),
          },
        },
        { provide: getRepositoryToken(Document), useValue: { findOne: jest.fn() } },
      ],
    }).compile();

    bridge = module.get(NatsWsBridgeService);
    natsClient = module.get(NatsClientService) as any;
    gateway = module.get(RealtimeGateway) as any;
    documentRepo = module.get(getRepositoryToken(Document));
    await bridge.onModuleInit();
  });

  afterEach(() => jest.clearAllMocks());

  it('should register 5 NATS subscriptions', () => {
    expect(natsClient.subscribeDurable).toHaveBeenCalledTimes(5);
  });

  it('should emit pipeline.progress to session and pipeline rooms', async () => {
    const h = handlers.get('ai.tasks.progress')!;
    await h({
      session_id: 's1', pipeline_execution_id: 'p1', agent_execution_id: 'ae1',
      agent_type: 'EXT', agent_name: 'Ext', status: 'RUNNING',
      order_index: 1, progress_pct: 50, confidence_output: 0.9,
      correlation_id: 'c1', org_id: 'o1',
    });
    expect(gateway.emitToSession).toHaveBeenCalledWith('s1', WS_EVENTS.PIPELINE_PROGRESS, expect.objectContaining({ progress_pct: 50 }));
    expect(gateway.emitToPipeline).toHaveBeenCalledWith('p1', WS_EVENTS.PIPELINE_PROGRESS, expect.anything());
  });

  it('should emit agent.log when log field present', async () => {
    const h = handlers.get('ai.tasks.progress')!;
    await h({
      session_id: 's1', pipeline_execution_id: 'p1', agent_execution_id: 'ae1',
      agent_type: 'EXT', agent_name: 'Ext', status: 'RUNNING',
      order_index: 1, progress_pct: 50, correlation_id: 'c1', org_id: 'o1',
      log: { level: 'INFO', message: 'step 3' },
    });
    expect(gateway.emitToPipeline).toHaveBeenCalledWith('p1', WS_EVENTS.AGENT_LOG, expect.objectContaining({ message: 'step 3' }));
  });

  it('should skip emit when no listeners (backpressure)', async () => {
    gateway.hasListeners.mockReturnValue(false);
    const h = handlers.get('ai.tasks.progress')!;
    await h({
      session_id: 's1', pipeline_execution_id: 'p1', agent_execution_id: 'ae1',
      agent_type: 'EXT', agent_name: 'Ext', status: 'RUNNING',
      order_index: 1, progress_pct: 50, correlation_id: 'c1', org_id: 'o1',
    });
    expect(gateway.emitToSession).not.toHaveBeenCalled();
    expect(gateway.emitToPipeline).not.toHaveBeenCalled();
  });

  it('should emit workflow.updated', async () => {
    const h = handlers.get('workflow.events.updated')!;
    await h({ workflow_id: 'w1', version_number: 2, changed_elements: [], source: 'ai', correlation_id: 'c1' });
    expect(gateway.emitToWorkflow).toHaveBeenCalledWith('w1', WS_EVENTS.WORKFLOW_UPDATED, expect.objectContaining({ workflow_id: 'w1' }));
  });

  it('should emit session.finalized', async () => {
    const h = handlers.get('session.events.finalized')!;
    await h({ session_id: 's2', workflow_id: 'w2', final_version_number: 3, final_confidence: 0.92, finalized_at: '2026-01-01' });
    expect(gateway.emitToSession).toHaveBeenCalledWith('s2', WS_EVENTS.SESSION_FINALIZED, expect.objectContaining({ session_id: 's2' }));
  });

  it('should emit document.ready with session lookup', async () => {
    documentRepo.findOne.mockResolvedValue({ id: 'd1', sessionId: 's3' });
    const h = handlers.get('document.preprocess.result')!;
    await h({ document_id: 'd1', extracted_text: 'text here', preprocessing_confidence: 0.85 });
    expect(gateway.emitToSession).toHaveBeenCalledWith('s3', WS_EVENTS.DOCUMENT_READY, expect.objectContaining({ document_id: 'd1' }));
  });

  it('should emit system.health.alert to admin-health', async () => {
    const h = handlers.get('system.health.ping')!;
    await h({ service: 'nats', status: 'degraded', timestamp: '2026-01-01', details: {} });
    expect(gateway.emitToAdminHealth).toHaveBeenCalledWith(WS_EVENTS.SYSTEM_HEALTH_ALERT, expect.objectContaining({ component: 'nats' }));
  });
});
