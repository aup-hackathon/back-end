import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { AgentType } from '../../../database/enums';

@Entity('agent_definition')
export class AgentDefinition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 128, unique: true })
  name: string;

  @Column({ type: 'enum', enum: AgentType, enumName: 'agent_type_enum' })
  agentType: AgentType;

  @Column({ type: 'varchar', length: 32, default: '1.0.0' })
  version: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  capabilities: unknown[];

  @Column({ type: 'jsonb', default: () => "'{}'" })
  defaultConfig: Record<string, unknown>;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
