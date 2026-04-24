import { Injectable } from '@nestjs/common';
import { instanceToPlain } from 'class-transformer';

import {
  AiContextLoadEvent,
  AiTaskDivergenceEvent,
  AiTaskNewEvent,
  DocumentPreprocessEvent,
  SessionFinalizedEvent,
  SystemHealthPingEvent,
  WorkflowUpdatedEvent,
} from '../../core/messaging/events';
import { SUBJECTS } from '../../core/messaging';
import { NatsClientService } from './nats.client';

@Injectable()
export class NatsPublisherService {
  constructor(private readonly natsClient: NatsClientService) { }

  async publishAiTaskNew(payload: AiTaskNewEvent): Promise<void> {
    await this.natsClient.publish(
      SUBJECTS.AI_TASKS_NEW,
      payload as unknown as Record<string, unknown>,
      this.buildMsgId(payload.correlation_id, SUBJECTS.AI_TASKS_NEW, payload.pipeline_execution_id),
    );
  }

  async publishAiTaskDivergence(payload: AiTaskDivergenceEvent): Promise<void> {
    await this.natsClient.publish(
      SUBJECTS.AI_TASKS_DIVERGENCE,
      payload as unknown as Record<string, unknown>,
      this.buildMsgId(payload.correlation_id, SUBJECTS.AI_TASKS_DIVERGENCE, payload.report_id),
    );
  }

  async publishAiContextLoad(payload: AiContextLoadEvent): Promise<void> {
    await this.natsClient.publish(
      SUBJECTS.AI_CONTEXT_LOAD,
      payload as unknown as Record<string, unknown>,
      this.buildMsgId(payload.correlation_id, SUBJECTS.AI_CONTEXT_LOAD),
    );
  }

  async publishDocumentPreprocess(payload: DocumentPreprocessEvent): Promise<void> {
    await this.natsClient.publish(
      SUBJECTS.DOCUMENT_PREPROCESS,
      payload as unknown as Record<string, unknown>,
      this.buildMsgId(payload.document_id, SUBJECTS.DOCUMENT_PREPROCESS),
    );
  }

  async publishWorkflowUpdated(payload: WorkflowUpdatedEvent): Promise<void> {
    await this.natsClient.publish(
      SUBJECTS.WORKFLOW_UPDATED,
      payload as unknown as Record<string, unknown>,
      this.buildMsgId(payload.correlation_id, SUBJECTS.WORKFLOW_UPDATED),
    );
  }

  async publishSessionFinalized(payload: SessionFinalizedEvent): Promise<void> {
    await this.natsClient.publish(
      SUBJECTS.SESSION_FINALIZED,
      payload as unknown as Record<string, unknown>,
      this.buildMsgId(payload.session_id, SUBJECTS.SESSION_FINALIZED),
    );
  }

  async publishSystemHealthPing(payload: SystemHealthPingEvent): Promise<void> {
    await this.natsClient.publish(
      SUBJECTS.SYSTEM_HEALTH_PING,
      payload as unknown as Record<string, unknown>,
      this.buildMsgId(payload.timestamp, SUBJECTS.SYSTEM_HEALTH_PING),
    );
  }

  private buildMsgId(correlationId: string, subject: string, pipelineExecutionId?: string): string {
    return `${correlationId}:${subject}:${pipelineExecutionId ?? ''}`;
  }
}
