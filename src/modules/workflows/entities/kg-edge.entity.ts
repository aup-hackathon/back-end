import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('kg_edge')
export class KGEdge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  sessionId: string;

  @Column({ type: 'uuid' })
  fromNodeId: string;

  @Column({ type: 'uuid' })
  toNodeId: string;

  @Column({ type: 'varchar', length: 64 })
  relationType: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  condition: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  properties: Record<string, unknown>;

  @Column({ type: 'float', nullable: true })
  confidence: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
