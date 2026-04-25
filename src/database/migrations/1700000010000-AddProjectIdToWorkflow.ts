import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProjectIdToWorkflow1700000010000 implements MigrationInterface {
  name = 'AddProjectIdToWorkflow1700000010000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE workflow
      ADD COLUMN IF NOT EXISTS project_id uuid;

      CREATE INDEX IF NOT EXISTS idx_workflow_project_id ON workflow (project_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_workflow_project_id;
      ALTER TABLE workflow DROP COLUMN IF EXISTS project_id;
    `);
  }
}