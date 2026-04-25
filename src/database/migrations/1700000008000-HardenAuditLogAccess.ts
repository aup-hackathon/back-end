import { MigrationInterface, QueryRunner } from 'typeorm';

export class HardenAuditLogAccess1700000008000 implements MigrationInterface {
  name = 'HardenAuditLogAccess1700000008000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_log_workflow_event_created
        ON audit_log (workflow_id, event_type, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_audit_log_workflow_actor_created
        ON audit_log (workflow_id, actor_id, created_at DESC);

      REVOKE UPDATE, DELETE ON TABLE audit_log FROM PUBLIC;

      DO $$
      BEGIN
        EXECUTE format('REVOKE UPDATE, DELETE ON TABLE audit_log FROM %I', current_user);
        EXECUTE format('GRANT SELECT, INSERT ON TABLE audit_log TO %I', current_user);
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_audit_log_workflow_actor_created;
      DROP INDEX IF EXISTS idx_audit_log_workflow_event_created;

      GRANT UPDATE, DELETE ON TABLE audit_log TO PUBLIC;

      DO $$
      BEGIN
        EXECUTE format('GRANT UPDATE, DELETE ON TABLE audit_log TO %I', current_user);
      END $$;
    `);
  }
}
