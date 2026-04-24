import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

import {
  ComparisonType,
  DivergenceReportStatus,
  DivergenceSeverity,
} from '../../../database/enums';

@Entity('divergence_report')
export class DivergenceReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  workflowId: string;

  @Column({ type: 'uuid' })
  graphAId: string;

  @Column({ type: 'uuid' })
  graphBId: string;

  @Column({ type: 'enum', enum: ComparisonType, enumName: 'comparison_type_enum' })
  comparisonType: ComparisonType;

  @Column({
    type: 'enum',
    enum: DivergenceReportStatus,
    enumName: 'divergence_report_status_enum',
    default: DivergenceReportStatus.PENDING,
  })
  status: DivergenceReportStatus;

  @Column({ type: 'float', nullable: true })
  overallSimilarity: number | null;

  @Column({
    type: 'enum',
    enum: DivergenceSeverity,
    enumName: 'divergence_severity_enum',
    nullable: true,
  })
  severity: DivergenceSeverity | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  algorithmUsed: string | null;

  @Column({ type: 'smallint', default: 0 })
  totalPoints: number;

  @Column({ type: 'smallint', default: 0 })
  criticalCount: number;

  @Column({ type: 'smallint', default: 0 })
  highCount: number;

  @Column({ type: 'smallint', default: 0 })
  mediumCount: number;

  @Column({ type: 'smallint', default: 0 })
  lowCount: number;

  @Column({ type: 'boolean', default: false })
  autoTriggered: boolean;

  @Column({ type: 'uuid', nullable: true })
  triggeredBy: string | null;

  @Column({ type: 'uuid', nullable: true })
  pipelineExecutionId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
