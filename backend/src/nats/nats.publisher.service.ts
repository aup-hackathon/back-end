import { Injectable } from '@nestjs/common';
import { plainToInstance, instanceToPlain } from 'class-transformer';
import { validateOrReject } from 'class-validator';

import {
  AiContextLoadPayload,
  AiTaskDivergencePayload,
  AiTaskNewPayload,
  SessionFinalizedPayload,
  SUBJECTS,
  SystemHealthPingPayload,
  WorkflowUpdatedPayload,
} from './contracts';
import { NatsClientService } from './nats.client';

@Injectable()
export class NatsPublisherService {
  constructor(private readonly natsClient: NatsClientService) {}

  async publishAiTaskNew(payload: AiTaskNewPayload): Promise<void> {
    await this.validateDto(AiTaskNewPayload, payload);
    await this.natsClient.publish(
      SUBJECTS.AI_TASKS_NEW,
      instanceToPlain(payload) as unknown as Record<string, unknown>,
      this.buildMsgId(payload.correlation_id, SUBJECTS.AI_TASKS_NEW, payload.pipeline_execution_id),
    );
  }

  async publishAiTaskDivergence(payload: AiTaskDivergencePayload): Promise<void> {
    await this.validateDto(AiTaskDivergencePayload, payload);
    await this.natsClient.publish(
      SUBJECTS.AI_TASKS_DIVERGENCE,
      instanceToPlain(payload) as unknown as Record<string, unknown>,
      this.buildMsgId(payload.correlation_id, SUBJECTS.AI_TASKS_DIVERGENCE, payload.report_id),
    );
  }

  async publishAiContextLoad(payload: AiContextLoadPayload): Promise<void> {
    await this.validateDto(AiContextLoadPayload, payload);
    await this.natsClient.publish(
      SUBJECTS.AI_CONTEXT_LOAD,
      instanceToPlain(payload) as unknown as Record<string, unknown>,
      this.buildMsgId(payload.correlation_id, SUBJECTS.AI_CONTEXT_LOAD),
    );
  }

  async publishWorkflowUpdated(payload: WorkflowUpdatedPayload): Promise<void> {
    await this.validateDto(WorkflowUpdatedPayload, payload);
    await this.natsClient.publish(
      SUBJECTS.WORKFLOW_UPDATED,
      instanceToPlain(payload) as unknown as Record<string, unknown>,
      this.buildMsgId(payload.correlation_id, SUBJECTS.WORKFLOW_UPDATED),
    );
  }

  async publishSessionFinalized(payload: SessionFinalizedPayload): Promise<void> {
    await this.validateDto(SessionFinalizedPayload, payload);
    await this.natsClient.publish(
      SUBJECTS.SESSION_FINALIZED,
      instanceToPlain(payload) as unknown as Record<string, unknown>,
      this.buildMsgId(payload.session_id, SUBJECTS.SESSION_FINALIZED),
    );
  }

  async publishSystemHealthPing(payload: SystemHealthPingPayload): Promise<void> {
    await this.validateDto(SystemHealthPingPayload, payload);
    await this.natsClient.publish(
      SUBJECTS.SYSTEM_HEALTH_PING,
      instanceToPlain(payload) as unknown as Record<string, unknown>,
      this.buildMsgId(payload.timestamp, SUBJECTS.SYSTEM_HEALTH_PING),
    );
  }

  private buildMsgId(correlationId: string, subject: string, pipelineExecutionId?: string): string {
    return `${correlationId}:${subject}:${pipelineExecutionId ?? ''}`;
  }

  private async validateDto<T extends object>(type: new () => T, payload: T): Promise<void> {
    const dto = plainToInstance(type, payload);
    await validateOrReject(dto as object);
  }
}
