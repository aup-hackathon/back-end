import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { pgvectorTransformer } from '../../../database/pgvector.transformer';
import { JsonValue } from '../../../database/types/json-value.type';

@Entity('process_pattern')
export class ProcessPattern {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true })
  name: string;

  @Column({ type: 'text' })
  archetypeType: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'jsonb' })
  templateJson: JsonValue;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  requiredSlots: string[];

  @Column({ type: 'vector' as 'text', nullable: true, transformer: pgvectorTransformer(768) })
  embedding: number[] | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
