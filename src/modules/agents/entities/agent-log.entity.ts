import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { LogLevel } from '../../../database/enums';

@Entity('agent_log')
export class AgentLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  agentExecutionId: string;

  @Column({ type: 'enum', enum: LogLevel, enumName: 'log_level_enum', default: LogLevel.INFO })
  logLevel: LogLevel;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
