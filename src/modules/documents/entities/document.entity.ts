import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('document')
export class Document {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  workflowId: string | null;

  @Column({ type: 'uuid', nullable: true })
  sessionId: string | null;

  @Column({ type: 'text' })
  filename: string;

  @Column({ type: 'text' })
  fileType: string;

  @Column({ type: 'text' })
  storageUrl: string;

  @Column({ type: 'integer', default: 0 })
  fileSizeBytes: number;

  @Column({ type: 'text', nullable: true })
  extractedText: string | null;

  @Column({ type: 'float', nullable: true })
  preprocessingConfidence: number | null;

  @Column({ type: 'integer', default: 1 })
  docVersion: number;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
