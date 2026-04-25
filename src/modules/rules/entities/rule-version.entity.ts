import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('rule_version')
export class RuleVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  ruleId: string;

  @Column({ type: 'smallint' })
  version: number;

  @Column({ type: 'text' })
  instruction: string;

  @Column({ type: 'jsonb', nullable: true })
  condition: Record<string, unknown> | null;

  @Column({ type: 'smallint', default: 100 })
  priority: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'uuid' })
  changedBy: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
