import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { pgvectorTransformer } from '../../../database/pgvector.transformer';

@Entity('kg_node')
export class KGNode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  sessionId: string;

  @Column({ type: 'varchar', length: 64 })
  type: string;

  @Column({ type: 'varchar', length: 256 })
  label: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  properties: Record<string, unknown>;

  @Column({ type: 'float', nullable: true })
  confidence: number | null;

  @Column({ type: 'vector' as 'text', nullable: true, transformer: pgvectorTransformer(768) })
  embedding: number[] | null;

  @Column({ type: 'boolean', default: false })
  inferred: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
