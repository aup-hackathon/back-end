import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { WorkflowStatus } from '../../../database/enums';

@Entity('workflow')
export class Workflow {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    type: 'enum',
    enum: WorkflowStatus,
    enumName: 'workflow_status_enum',
    default: WorkflowStatus.DRAFT,
  })
  status: WorkflowStatus;

  @Column({ type: 'integer', default: 0 })
  currentVersion: number;

  @Column({ type: 'uuid' })
  orgId: string;

  @Column({ type: 'uuid' })
  ownerId: string;

  @Column({ type: 'uuid', nullable: true })
  projectId: string | null;

  @Column({ type: 'text', nullable: true })
  domain: string | null;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  tags: string[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
