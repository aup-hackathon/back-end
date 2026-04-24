import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { ConfigOverrideScope } from '../../../database/enums';

@Entity('agent_config_override')
export class AgentConfigOverride {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  agentDefinitionId: string;

  @Column({ type: 'enum', enum: ConfigOverrideScope, enumName: 'config_override_scope_enum' })
  scopeType: ConfigOverrideScope;

  @Column({ type: 'uuid' })
  scopeId: string;

  @Column({ type: 'jsonb' })
  configPatch: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'uuid' })
  createdBy: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
