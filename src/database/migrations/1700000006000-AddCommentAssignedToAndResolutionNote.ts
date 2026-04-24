import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCommentAssignedToAndResolutionNote1700000006000 implements MigrationInterface {
  name = 'AddCommentAssignedToAndResolutionNote1700000006000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add assigned_to field
    await queryRunner.query(`
      ALTER TABLE comment
      ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES "user"(id);
    `);

    // Add resolution_note field
    await queryRunner.query(`
      ALTER TABLE comment
      ADD COLUMN IF NOT EXISTS resolution_note text;
    `);

    // Add index for (assigned_to, resolved) for efficient queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_comment_assigned_resolved
      ON comment (assigned_to, resolved)
      WHERE assigned_to IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_comment_assigned_resolved;`);
    await queryRunner.query(`ALTER TABLE comment DROP COLUMN IF EXISTS resolution_note;`);
    await queryRunner.query(`ALTER TABLE comment DROP COLUMN IF EXISTS assigned_to;`);
  }
}