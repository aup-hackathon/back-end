import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('skill_application')
export class SkillApplication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  skillId: string;

  @Column({ type: 'uuid' })
  agentExecutionId: string;

  @Column({ type: 'smallint', nullable: true })
  retrievalRank: number | null;

  @Column({ type: 'float', nullable: true })
  similarityScore: number | null;

  @Column({ type: 'smallint', default: 0 })
  injectedTokens: number;

  @Column({ type: 'boolean', default: false })
  wasMandatory: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
