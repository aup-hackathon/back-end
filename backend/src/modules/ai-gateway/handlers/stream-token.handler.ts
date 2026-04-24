import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';

import { AgentExecutionStatus, AgentType, LogLevel, PipelineStatus } from '../../../database/enums';
import { AgentExecution, AgentLog, PipelineExecution } from '../../agents/entities';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { AiTaskProgressEvent } from '../../../core/messaging/events';

export interface StreamTokenHandlerDeps {
  sessionsRepository: Repository<any>;
  workflowsRepository: Repository<any>;
  pipelineExecutionsRepository: Repository<PipelineExecution>;
  agentExecutionRepository: Repository<AgentExecution>;
  agentLogRepository: Repository<AgentLog>;
  realtimeGateway: RealtimeGateway;
}

@Injectable()
export class StreamTokenHandler {
  private readonly handledIds = new Set<string>();

  constructor(private readonly deps: StreamTokenHandlerDeps) {}

  async handle(payload: AiTaskProgressEvent, msgId?: string | null): Promise<void> {
    const idempotencyKey = this.idempotencyKey(msgId, payload.correlation_id, 'ai.tasks.progress');
    if (this.isAlreadyHandled(idempotencyKey)) return;

    const { pipelineExecutionsRepository, agentExecutionRepository, agentLogRepository, realtimeGateway, sessionsRepository, workflowsRepository } = this.deps;

    await this.assertOrgMatch(payload.org_id, payload.session_id, sessionsRepository, workflowsRepository);

    const pipelineExecution = await pipelineExecutionsRepository.findOne({
      where: { id: payload.pipeline_execution_id, sessionId: payload.session_id },
    });
    if (!pipelineExecution) throw new Error('Pipeline execution not found for ai.tasks.progress');

    const existingAgentExecution = await agentExecutionRepository.findOne({
      where: { id: payload.agent_execution_id, pipelineExecutionId: payload.pipeline_execution_id },
    });

    const agentDefinitionId = await this.resolveAgentDefinitionId(payload.agent_type, pipelineExecutionsRepository);

    const agentExecution =
      existingAgentExecution ??
      agentExecutionRepository.create({
        id: payload.agent_execution_id,
        pipelineExecutionId: payload.pipeline_execution_id,
        agentDefinitionId,
        status: payload.status as unknown as AgentExecutionStatus,
        orderIndex: payload.order_index,
        inputSnapshot: null,
        outputSnapshot: null,
        confidenceInput: payload.confidence_input ?? null,
        confidenceOutput: payload.confidence_output ?? null,
        llmCallsCount: 0,
        tokensConsumed: 0,
        errorMessage: payload.error_message ?? null,
        durationMs: null,
        startedAt: payload.started_at ? new Date(payload.started_at) : null,
        completedAt: payload.completed_at ? new Date(payload.completed_at) : null,
      });

    agentExecution.status = payload.status as unknown as AgentExecutionStatus;
    agentExecution.orderIndex = payload.order_index;
    if (payload.confidence_input != null) agentExecution.confidenceInput = payload.confidence_input;
    if (payload.confidence_output != null) agentExecution.confidenceOutput = payload.confidence_output;
    if (payload.llm_calls_delta != null) {
      agentExecution.llmCallsCount = Math.max(0, agentExecution.llmCallsCount + payload.llm_calls_delta);
      pipelineExecution.totalLlmCalls = Math.max(0, pipelineExecution.totalLlmCalls + payload.llm_calls_delta);
    }
    if (payload.tokens_delta != null) {
      agentExecution.tokensConsumed = Math.max(0, agentExecution.tokensConsumed + payload.tokens_delta);
      pipelineExecution.totalTokensConsumed = Math.max(0, pipelineExecution.totalTokensConsumed + payload.tokens_delta);
    }
    if (payload.started_at) agentExecution.startedAt = new Date(payload.started_at);
    if (payload.completed_at) agentExecution.completedAt = new Date(payload.completed_at);
    if (payload.error_message) agentExecution.errorMessage = payload.error_message;

    await agentExecutionRepository.save(agentExecution);

    if (payload.log) {
      await agentLogRepository.insert({
        agentExecutionId: agentExecution.id,
        logLevel: payload.log.level as unknown as LogLevel,
        message: payload.log.message,
        metadata: payload.log.metadata ?? {},
      });
    }

    pipelineExecution.lastCheckpointAgent = payload.agent_type as AgentType;
    pipelineExecution.status = payload.status === AgentExecutionStatus.FAILED ? PipelineStatus.PAUSED : PipelineStatus.RUNNING;
    if (!pipelineExecution.startedAt) pipelineExecution.startedAt = new Date();
    if (payload.status === AgentExecutionStatus.COMPLETED || payload.status === AgentExecutionStatus.FAILED) {
      pipelineExecution.completedAt = null;
    }
    await pipelineExecutionsRepository.save(pipelineExecution);

    realtimeGateway.emitToSession(payload.session_id, 'pipeline.progress', {
      pipelineExecutionId: payload.pipeline_execution_id,
      agentExecutionId: payload.agent_execution_id,
      agentType: payload.agent_type,
      status: payload.status,
      progressPct: payload.progress_pct,
    });

    this.markHandled(idempotencyKey);
  }

  private async assertOrgMatch(
    orgId: string,
    sessionId: string,
    sessionsRepository: Repository<any>,
    workflowsRepository: Repository<any>,
  ): Promise<void> {
    const session = await sessionsRepository.findOne({ where: { id: sessionId } });
    if (!session) throw new Error('Session not found for org validation');
    const workflow = await workflowsRepository.findOne({ where: { id: session.workflowId } });
    if (!workflow) throw new Error('Workflow not found for org validation');
    if (workflow.orgId !== orgId) {
      throw new Error('org_id mismatch in NATS payload');
    }
  }

  private async resolveAgentDefinitionId(agentType: string, pipelineExecutionsRepository: Repository<PipelineExecution>): Promise<string> {
    const row = await pipelineExecutionsRepository.query(
      `SELECT id FROM agent_definition WHERE agent_type = $1 ORDER BY created_at ASC LIMIT 1`,
      [agentType],
    );
    if (!row?.[0]?.id) {
      throw new Error(`Agent definition missing for ${agentType}`);
    }
    return row[0].id as string;
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