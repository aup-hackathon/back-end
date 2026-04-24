import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AgentType, PipelineTaskType, PipelineStatus, SessionMode } from '../../database/enums';
import { RequestContextService } from '../../core/context/request-context.service';
import { PipelineExecution } from '../agents/entities/pipeline-execution.entity';
import { Rule } from '../rules/entities/rule.entity';
import { Skill } from '../skills/entities/skill.entity';
import { Session } from '../sessions/entities/session.entity';
import { NatsPublisherService } from '../../nats/nats.publisher.service';

@Injectable()
export class AIGatewayService {
  constructor(
    private readonly natsPublisher: NatsPublisherService,
    private readonly requestContextService: RequestContextService,
    @InjectRepository(PipelineExecution)
    private readonly pipelineExecutionRepository: Repository<PipelineExecution>,
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    @InjectRepository(Rule)
    private readonly ruleRepository: Repository<Rule>,
    @InjectRepository(Skill)
    private readonly skillRepository: Repository<Skill>,
  ) {}

  async publishAiTask(params: {
    sessionId: string;
    taskType: PipelineTaskType;
    mode: SessionMode;
    input: Record<string, unknown>;
    triggeredBy?: string | null;
    resumeFromCheckpoint?: AgentType;
  }): Promise<{ pipelineExecutionId: string; natsMessageId: string }> {
    const session = await this.sessionRepository.findOne({ where: { id: params.sessionId } });
    if (!session) {
      throw new Error('Session not found when publishing ai task');
    }

    const orgId = await this.resolveOrgIdForSession(session);
    const correlationId = this.requestContextService.getCorrelationId();

    const pipelineExecution = this.pipelineExecutionRepository.create({
      sessionId: params.sessionId,
      taskType: params.taskType,
      mode: params.mode,
      status: PipelineStatus.PENDING,
      inputPayload: params.input,
      retryCount: 0,
      lastCheckpointAgent: null,
      triggeredBy: params.triggeredBy ?? null,
      natsMessageId: null,
      startedAt: null,
      completedAt: null,
      totalDurationMs: null,
      totalLlmCalls: 0,
      totalTokensConsumed: 0,
      finalConfidence: null,
      errorSummary: null,
      archivedAt: null,
    });
    const savedExecution = await this.pipelineExecutionRepository.save(pipelineExecution);

    const activeRules = await this.ruleRepository.find({
      where: { orgId, isActive: true },
      order: { priority: 'ASC', updatedAt: 'DESC' },
      take: 50,
    });
    const skillIds = await this.skillRepository.find({
      where: { orgId, isActive: true },
      order: { isMandatory: 'DESC', updatedAt: 'DESC' },
      take: 50,
    });

    await this.natsPublisher.publishAiContextLoad({
      correlation_id: correlationId,
      session_id: session.id,
      org_id: orgId,
      active_rules: activeRules.map((rule) => ({
        id: rule.id,
        rule_type: rule.ruleType,
        scope: rule.scope,
        target_agent: rule.targetAgent,
        condition: rule.condition,
        instruction: rule.instruction,
        priority: rule.priority,
      })),
      skill_ids: skillIds.map((skill) => skill.id),
    });

    await this.natsPublisher.publishAiTaskNew({
      correlation_id: correlationId,
      session_id: session.id,
      org_id: orgId,
      task_type: params.taskType,
      mode: params.mode,
      input: params.input,
      pipeline_execution_id: savedExecution.id,
      ...(params.resumeFromCheckpoint
        ? { resume_from_checkpoint: params.resumeFromCheckpoint }
        : {}),
      ...(params.triggeredBy ? { triggered_by: params.triggeredBy } : {}),
    });

    const natsMessageId = `${correlationId}:ai.tasks.new:${savedExecution.id}`;
    savedExecution.natsMessageId = natsMessageId;
    await this.pipelineExecutionRepository.save(savedExecution);

    return {
      pipelineExecutionId: savedExecution.id,
      natsMessageId,
    };
  }

  private async resolveOrgIdForSession(session: Session): Promise<string> {
    const row = await this.pipelineExecutionRepository.query(
      `
        SELECT w.org_id AS "orgId"
        FROM session s
        JOIN workflow w ON w.id = s.workflow_id
        WHERE s.id = $1
      `,
      [session.id],
    );

    const orgId = row?.[0]?.orgId as string | undefined;
    if (!orgId) {
      throw new Error('Unable to resolve orgId from session');
    }
    return orgId;
  }
}
