import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProjectsTable1700000009000 implements MigrationInterface {
  name = 'AddProjectsTable1700000009000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS project (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar(255) NOT NULL,
        org_id uuid NOT NULL,
        owner_id uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_project_org_id ON project (org_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_project_name_org ON project (name, org_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_project_name_org;
      DROP INDEX IF EXISTS idx_project_org_id;
      DROP TABLE IF EXISTS project;
    `);
  }
}