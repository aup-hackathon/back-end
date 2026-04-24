import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { CommentType } from '../../../database/enums';

@Entity('comment')
export class Comment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  workflowId: string;

  @Column({ type: 'text', nullable: true })
  elementId: string | null;

  @Column({ type: 'uuid' })
  authorId: string;

  @Column({ type: 'enum', enum: CommentType, enumName: 'comment_type_enum' })
  type: CommentType;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'boolean', default: false })
  resolved: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  resolvedBy: string | null;

  @Column({ type: 'text', nullable: true })
  resolutionNote: string | null;

  @Column({ type: 'uuid', nullable: true })
  parentId: string | null;

  @Column({ type: 'uuid', nullable: true })
  assignedTo: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
