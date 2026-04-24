import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { AgentType, PipelineStatus, PipelineTaskType, SessionMode } from '../../../database/enums';
import { JsonValue } from '../../../database/types/json-value.type';

@Entity('pipeline_execution')
export class PipelineExecution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  sessionId: string;

  @Column({ type: 'enum', enum: PipelineTaskType, enumName: 'pipeline_task_type_enum' })
  taskType: PipelineTaskType;

  @Column({ type: 'varchar', length: 16 })
  mode: SessionMode;

  @Column({
    type: 'enum',
    enum: PipelineStatus,
    enumName: 'pipeline_status_enum',
    default: PipelineStatus.PENDING,
  })
  status: PipelineStatus;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  inputPayload: JsonValue;

  @Column({ type: 'smallint', default: 0 })
  retryCount: number;

  @Column({ type: 'enum', enum: AgentType, enumName: 'agent_type_enum', nullable: true })
  lastCheckpointAgent: AgentType | null;

  @Column({ type: 'uuid', nullable: true })
  triggeredBy: string | null;

  @Column({ type: 'varchar', length: 256, nullable: true })
  natsMessageId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'integer', nullable: true })
  totalDurationMs: number | null;

  @Column({ type: 'integer', default: 0 })
  totalLlmCalls: number;

  @Column({ type: 'integer', default: 0 })
  totalTokensConsumed: number;

  @Column({ type: 'float', nullable: true })
  finalConfidence: number | null;

  @Column({ type: 'text', nullable: true })
  errorSummary: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  archivedAt: Date | null;
}
