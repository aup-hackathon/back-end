import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { GraphSource, GraphType } from '../../../database/enums';
import { pgvectorTransformer } from '../../../database/pgvector.transformer';

@Entity('workflow_graph_snapshot')
export class WorkflowGraphSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  workflowId: string;

  @Column({ type: 'uuid', nullable: true })
  workflowVersionId: string | null;

  @Column({ type: 'uuid', nullable: true })
  sessionId: string | null;

  @Column({ type: 'enum', enum: GraphType, enumName: 'graph_type_enum' })
  graphType: GraphType;

  @Column({ type: 'enum', enum: GraphSource, enumName: 'graph_source_enum' })
  source: GraphSource;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  nodes: unknown[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  edges: unknown[];

  @Column({ type: 'smallint', default: 0 })
  nodeCount: number;

  @Column({ type: 'smallint', default: 0 })
  edgeCount: number;

  @Column({ type: 'vector' as 'text', nullable: true, transformer: pgvectorTransformer(768) })
  graphEmbedding: number[] | null;

  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
