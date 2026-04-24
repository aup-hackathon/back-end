import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { MessageRole, MessageType } from '../../../database/enums';

@Entity('message')
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  sessionId: string;

  @Column({ type: 'enum', enum: MessageRole, enumName: 'message_role_enum' })
  role: MessageRole;

  @Column({ type: 'enum', enum: MessageType, enumName: 'message_type_enum' })
  type: MessageType;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  archivedAt: Date | null;
}
