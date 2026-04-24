import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { ReconciliationActionType } from '../../../database/enums';

@Entity('reconciliation_action')
export class ReconciliationAction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  divergencePointId: string;

  @Column({
    type: 'enum',
    enum: ReconciliationActionType,
    enumName: 'reconciliation_action_type_enum',
  })
  actionType: ReconciliationActionType;

  @Column({ type: 'uuid', nullable: true })
  appliedByUser: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  appliedByAgent: string | null;

  @Column({ type: 'uuid', nullable: true })
  resultGraphSnapshotId: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
