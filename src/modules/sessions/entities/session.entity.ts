import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { SessionMode, SessionStatus } from '../../../database/enums';

@Entity('session')
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  workflowId: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'enum', enum: SessionMode, enumName: 'session_mode_enum' })
  mode: SessionMode;

  @Column({
    type: 'enum',
    enum: SessionStatus,
    enumName: 'session_status_enum',
    default: SessionStatus.CREATED,
  })
  status: SessionStatus;

  @Column({ type: 'float', default: 0 })
  confidenceScore: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  finalizedAt: Date | null;
}
