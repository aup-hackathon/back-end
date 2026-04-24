import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('rule_application')
export class RuleApplication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  ruleId: string;

  @Column({ type: 'smallint' })
  ruleVersion: number;

  @Column({ type: 'uuid' })
  agentExecutionId: string;

  @Column({ type: 'boolean' })
  triggered: boolean;

  @Column({ type: 'text', nullable: true })
  impactDescription: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
