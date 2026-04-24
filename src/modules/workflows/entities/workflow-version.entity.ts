import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { JsonValue } from '../../../database/types/json-value.type';

@Entity('workflow_version')
export class WorkflowVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  workflowId: string;

  @Column({ type: 'integer' })
  versionNumber: number;

  @Column({ type: 'jsonb' })
  elementsJson: JsonValue;

  @Column({ type: 'jsonb', nullable: true })
  elsaJson: JsonValue | null;

  @Column({ type: 'float', nullable: true })
  confidenceScore: number | null;

  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
