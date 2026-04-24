import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { AgentExecutionStatus } from '../../../database/enums';
import { JsonValue } from '../../../database/types/json-value.type';

@Entity('agent_execution')
export class AgentExecution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  pipelineExecutionId: string;

  @Column({ type: 'uuid' })
  agentDefinitionId: string;

  @Column({
    type: 'enum',
    enum: AgentExecutionStatus,
    enumName: 'agent_execution_status_enum',
    default: AgentExecutionStatus.PENDING,
  })
  status: AgentExecutionStatus;

  @Column({ type: 'smallint' })
  orderIndex: number;

  @Column({ type: 'jsonb', nullable: true })
  inputSnapshot: JsonValue | null;

  @Column({ type: 'jsonb', nullable: true })
  outputSnapshot: JsonValue | null;

  @Column({ type: 'float', nullable: true })
  confidenceInput: number | null;

  @Column({ type: 'float', nullable: true })
  confidenceOutput: number | null;

  @Column({ type: 'smallint', default: 0 })
  llmCallsCount: number;

  @Column({ type: 'integer', default: 0 })
  tokensConsumed: number;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'integer', nullable: true })
  durationMs: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
