import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { DivergencePointType, PointSeverity } from '../../../database/enums';

@Entity('divergence_point')
export class DivergencePoint {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  reportId: string;

  @Column({ type: 'enum', enum: DivergencePointType, enumName: 'divergence_point_type_enum' })
  pointType: DivergencePointType;

  @Column({ type: 'enum', enum: PointSeverity, enumName: 'point_severity_enum' })
  severity: PointSeverity;

  @Column({ type: 'varchar', length: 128, nullable: true })
  elementIdInA: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  elementIdInB: string | null;

  @Column({ type: 'varchar', length: 256, nullable: true })
  elementLabelA: string | null;

  @Column({ type: 'varchar', length: 256, nullable: true })
  elementLabelB: string | null;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'text', nullable: true })
  aiSuggestion: string | null;

  @Column({ type: 'boolean', default: false })
  autoFixable: boolean;

  @Column({ type: 'boolean', default: false })
  resolved: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  resolvedBy: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
