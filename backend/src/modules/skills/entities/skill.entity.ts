import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { AgentType, SkillType } from '../../../database/enums';
import { pgvectorTransformer } from '../../../database/pgvector.transformer';
import { JsonValue } from '../../../database/types/json-value.type';

@Entity('skill')
export class Skill {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  orgId: string;

  @Column({ type: 'varchar', length: 256 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: SkillType, enumName: 'skill_type_enum' })
  skillType: SkillType;

  @Column({ type: 'jsonb' })
  content: JsonValue;

  @Column({ type: 'vector' as 'text', nullable: true, transformer: pgvectorTransformer(768) })
  embedding: number[] | null;

  @Column({ type: 'text', array: true, nullable: true })
  appliesToDomains: string[] | null;

  @Column({
    type: 'enum',
    enum: AgentType,
    enumName: 'agent_type_enum',
    array: true,
    nullable: true,
  })
  appliesToAgents: AgentType[] | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'boolean', default: false })
  isMandatory: boolean;

  @Column({ type: 'integer', default: 0 })
  usageCount: number;

  @Column({ type: 'smallint', default: 1 })
  version: number;

  @Column({ type: 'uuid' })
  createdBy: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
