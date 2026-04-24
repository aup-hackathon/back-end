import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDocumentStorageFields1700000002000 implements MigrationInterface {
  name = 'AddDocumentStorageFields1700000002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE document
      ADD COLUMN file_size_bytes integer NOT NULL DEFAULT 0,
      ADD COLUMN deleted_at timestamptz
    `);

    await queryRunner.query(`
      CREATE INDEX idx_document_session_filename_version
      ON document (session_id, filename, doc_version DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_document_workflow_active_created_at
      ON document (workflow_id, created_at DESC)
      WHERE deleted_at IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_document_workflow_active_created_at`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_document_session_filename_version`);
    await queryRunner.query(`
      ALTER TABLE document
      DROP COLUMN IF EXISTS deleted_at,
      DROP COLUMN IF EXISTS file_size_bytes
    `);
  }
}
