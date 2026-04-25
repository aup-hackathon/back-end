import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRuleVersionStateFields1700000007000 implements MigrationInterface {
  name = 'AddRuleVersionStateFields1700000007000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rule_version
      ADD COLUMN IF NOT EXISTS priority smallint NOT NULL DEFAULT 100
    `);
    await queryRunner.query(`
      ALTER TABLE rule_version
      ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rule_version
      DROP COLUMN IF EXISTS is_active
    `);
    await queryRunner.query(`
      ALTER TABLE rule_version
      DROP COLUMN IF EXISTS priority
    `);
  }
}
