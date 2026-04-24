import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMessageSearchIndexes1700000005000 implements MigrationInterface {
  name = 'AddMessageSearchIndexes1700000005000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_message_session_created_id
      ON message (session_id, created_at, id)
      WHERE archived_at IS NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_message_content_fts
      ON message
      USING GIN (to_tsvector('english', coalesce(content, '')));
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_message_content_fts;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_message_session_created_id;`);
  }
}
