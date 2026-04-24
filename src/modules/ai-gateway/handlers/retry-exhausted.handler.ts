import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { PipelineStatus } from '../../../database/enums';
import { PipelineExecution } from '../../agents/entities';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { AiTaskDlqService } from '../dlq/ai-task-dlq.service';

export interface RetryExhaustedHandlerDeps {
  pipelineExecutionsRepository: Repository<PipelineExecution>;
  realtimeGateway: RealtimeGateway;
  dlqService: AiTaskDlqService;
}

@Injectable()
export class RetryExhaustedHandler {
  private readonly logger = new Logger(RetryExhaustedHandler.name);

  constructor(private readonly deps: RetryExhaustedHandlerDeps) {}

  async handle(params: {
    subject: string;
    payload: Record<string, unknown>;
    error: unknown;
    deliveryCount: number;
    msgId?: string | null;
  }): Promise<void> {
    const { pipelineExecutionsRepository, realtimeGateway, dlqService } = this.deps;

    const pipelineExecutionId = (params.payload.pipeline_execution_id ?? null) as string | null;
    const sessionId = (params.payload.session_id ?? null) as string | null;
    const reason = `max deliveries reached for ${params.subject}`;
    const lastError = params.error instanceof Error ? params.error.message : String(params.error);

    if (pipelineExecutionId) {
      const pipelineExecution = await pipelineExecutionsRepository.findOne({
        where: { id: pipelineExecutionId },
      });
      if (pipelineExecution) {
        pipelineExecution.status = PipelineStatus.FAILED;
        pipelineExecution.errorSummary = lastError;
        pipelineExecution.completedAt = new Date();
        await pipelineExecutionsRepository.save(pipelineExecution);
      }
    }

    if (sessionId) {
      realtimeGateway.emitToSession(sessionId, 'pipeline.failed', {
        subject: params.subject,
        reason,
        lastError,
      });
    }

    await dlqService.recordFailure({
      subject: params.subject,
      payload: params.payload,
      reason,
      deliveryCount: params.deliveryCount,
      lastError,
      msgId: params.msgId,
    });

    this.logger.error(
      `Retry exhausted handled: subject=${params.subject} deliveryCount=${params.deliveryCount}`,
    );
  }
}