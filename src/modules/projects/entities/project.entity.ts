import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('project')
export class Project {
  @PrimaryColumn('uuid')
  id: string = require('crypto').randomUUID();

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'uuid' })
  @Index('idx_project_org_id')
  orgId: string;

  @Column({ type: 'uuid' })
  ownerId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}