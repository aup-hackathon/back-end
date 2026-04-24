import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { AgentType, RuleScope, RuleType } from '../../../database/enums';

@Entity('rule')
export class Rule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  orgId: string;

  @Column({ type: 'uuid', nullable: true })
  workflowId: string | null;

  @Column({ type: 'varchar', length: 256 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: RuleType, enumName: 'rule_type_enum' })
  ruleType: RuleType;

  @Column({ type: 'enum', enum: RuleScope, enumName: 'rule_scope_enum', default: RuleScope.ORG })
  scope: RuleScope;

  @Column({ type: 'enum', enum: AgentType, enumName: 'agent_type_enum', nullable: true })
  targetAgent: AgentType | null;

  @Column({ type: 'jsonb', nullable: true })
  condition: Record<string, unknown> | null;

  @Column({ type: 'text' })
  instruction: string;

  @Column({ type: 'smallint', default: 100 })
  priority: number;

  @Column({ type: 'smallint', default: 1 })
  version: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'uuid' })
  createdBy: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
