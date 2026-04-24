import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrganizationInviteFields1700000002000 implements MigrationInterface {
  name = 'AddOrganizationInviteFields1700000002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user"
        ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS invite_token_hash text,
        ADD COLUMN IF NOT EXISTS invite_expires_at timestamptz;

      CREATE INDEX IF NOT EXISTS idx_user_org_active ON "user" (org_id, is_active);
      CREATE INDEX IF NOT EXISTS idx_user_invite_token_hash ON "user" (invite_token_hash)
        WHERE invite_token_hash IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_user_invite_token_hash;
      DROP INDEX IF EXISTS idx_user_org_active;

      ALTER TABLE "user"
        DROP COLUMN IF EXISTS invite_expires_at,
        DROP COLUMN IF EXISTS invite_token_hash,
        DROP COLUMN IF EXISTS is_active;
    `);
  }
}
