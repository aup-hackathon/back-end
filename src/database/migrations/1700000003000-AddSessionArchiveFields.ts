import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSessionArchiveFields1700000003000 implements MigrationInterface {
  name = 'AddSessionArchiveFields1700000003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE session ADD COLUMN IF NOT EXISTS archived_at timestamptz;
      ALTER TABLE message ADD COLUMN IF NOT EXISTS archived_at timestamptz;
      ALTER TABLE document ADD COLUMN IF NOT EXISTS archived_at timestamptz;
      ALTER TABLE pipeline_execution ADD COLUMN IF NOT EXISTS archived_at timestamptz;

      CREATE INDEX IF NOT EXISTS idx_session_archived_at ON session (archived_at);
      CREATE INDEX IF NOT EXISTS idx_message_session_archived ON message (session_id, archived_at);
      CREATE INDEX IF NOT EXISTS idx_document_session_archived ON document (session_id, archived_at);
      CREATE INDEX IF NOT EXISTS idx_pipeline_session_archived ON pipeline_execution (session_id, archived_at);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_pipeline_session_archived;
      DROP INDEX IF EXISTS idx_document_session_archived;
      DROP INDEX IF EXISTS idx_message_session_archived;
      DROP INDEX IF EXISTS idx_session_archived_at;

      ALTER TABLE pipeline_execution DROP COLUMN IF EXISTS archived_at;
      ALTER TABLE document DROP COLUMN IF EXISTS archived_at;
      ALTER TABLE message DROP COLUMN IF EXISTS archived_at;
      ALTER TABLE session DROP COLUMN IF EXISTS archived_at;
    `);
  }
}
