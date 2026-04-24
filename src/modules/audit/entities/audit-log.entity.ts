import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { ActorType } from '../../../database/enums';
import { JsonValue } from '../../../database/types/json-value.type';

@Entity('audit_log')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  workflowId: string | null;

  @Column({ type: 'uuid', nullable: true })
  actorId: string | null;

  @Column({ type: 'enum', enum: ActorType, enumName: 'actor_type_enum' })
  actorType: ActorType;

  @Column({ type: 'varchar', length: 128 })
  eventType: string;

  @Column({ type: 'text', nullable: true })
  elementId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  beforeState: JsonValue | null;

  @Column({ type: 'jsonb', nullable: true })
  afterState: JsonValue | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
