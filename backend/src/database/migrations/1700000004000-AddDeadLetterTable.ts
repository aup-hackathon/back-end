import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeadLetterTable1700000004000 implements MigrationInterface {
  name = 'AddDeadLetterTable1700000004000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS dead_letter (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        subject varchar(255) NOT NULL,
        payload jsonb NOT NULL,
        reason text NOT NULL,
        delivery_count smallint NOT NULL,
        last_error text,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_dead_letter_subject_created
        ON dead_letter (subject, created_at DESC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_dead_letter_subject_created;
      DROP TABLE IF EXISTS dead_letter;
    `);
  }
}
