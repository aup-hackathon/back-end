import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitDatabaseSchema1700000000000 implements MigrationInterface {
  name = 'InitDatabaseSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS citext`);

    await queryRunner.query(`
      CREATE TYPE user_role_enum AS ENUM ('admin','process_owner','business_analyst','reviewer','viewer');
      CREATE TYPE workflow_status_enum AS ENUM ('draft','in_elicitation','pending_review','validated','exported','archived');
      CREATE TYPE session_mode_enum AS ENUM ('auto','interactive');
      CREATE TYPE session_status_enum AS ENUM ('created','awaiting_input','processing','in_elicitation','draft_ready','needs_reconciliation','in_review','validated','exported','archived','error');
      CREATE TYPE message_role_enum AS ENUM ('user','ai','system');
      CREATE TYPE message_type_enum AS ENUM ('user_input','ai_question','ai_response','ai_summary','ai_update','ai_confidence_report','system_note','system_status');
      CREATE TYPE comment_type_enum AS ENUM ('question','correction','approval','suggestion','escalation');
      CREATE TYPE actor_type_enum AS ENUM ('user','ai_agent','system');
      CREATE TYPE agent_type_enum AS ENUM ('ORCHESTRATOR','INTAKE','EXTRACTION','PATTERN','GAP_DETECTION','QA','VALIDATION','EXPORT','DIVERGENCE','RULES_SKILLS_LOADER');
      CREATE TYPE pipeline_task_type_enum AS ENUM ('FULL_PIPELINE','SCOPED_REPROCESS','EXPORT_ONLY','QA_ROUND');
      CREATE TYPE pipeline_status_enum AS ENUM ('PENDING','RUNNING','PAUSED','COMPLETED','FAILED','CANCELLED');
      CREATE TYPE agent_execution_status_enum AS ENUM ('PENDING','RUNNING','COMPLETED','FAILED','SKIPPED');
      CREATE TYPE log_level_enum AS ENUM ('DEBUG','INFO','WARNING','ERROR');
      CREATE TYPE config_override_scope_enum AS ENUM ('ORG','SESSION');
      CREATE TYPE graph_type_enum AS ENUM ('INTENT','GENERATED','EXECUTED','RECONCILED');
      CREATE TYPE graph_source_enum AS ENUM ('AI_EXTRACTION','AI_GENERATION','ELSA_IMPORT','MANUAL_MERGE');
      CREATE TYPE comparison_type_enum AS ENUM ('INTENT_VS_GENERATED','GENERATED_VS_EXECUTED','INTENT_VS_EXECUTED');
      CREATE TYPE divergence_severity_enum AS ENUM ('NONE','LOW','MEDIUM','HIGH','CRITICAL');
      CREATE TYPE divergence_report_status_enum AS ENUM ('PENDING','RUNNING','COMPLETED','FAILED');
      CREATE TYPE divergence_point_type_enum AS ENUM ('MISSING_NODE','EXTRA_NODE','MODIFIED_NODE','ACTOR_MISMATCH','CONDITION_MISMATCH','MISSING_EDGE','EXTRA_EDGE','REORDERED_SEQUENCE','LOOP_DIFFERENCE','MISSING_PATH','PARALLELISM_CHANGE');
      CREATE TYPE point_severity_enum AS ENUM ('INFO','LOW','MEDIUM','HIGH','CRITICAL');
      CREATE TYPE reconciliation_action_type_enum AS ENUM ('ACCEPT_A','ACCEPT_B','AI_SUGGEST_APPLY','MANUAL_EDIT','SKIP');
      CREATE TYPE rule_type_enum AS ENUM ('EXTRACTION','ACTOR_MAPPING','STRUCTURAL_CONSTRAINT','VALIDATION','NAMING_CONVENTION','PROMPT_INJECTION');
      CREATE TYPE rule_scope_enum AS ENUM ('ORG','WORKFLOW','AGENT');
      CREATE TYPE skill_type_enum AS ENUM ('VOCABULARY','ARCHETYPE','FEW_SHOT_EXAMPLE','DOMAIN_KNOWLEDGE','ACTOR_CATALOG','PROMPT_TEMPLATE');
    `);

    await queryRunner.query(`
      CREATE TABLE organization (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL UNIQUE,
        plan text NOT NULL DEFAULT 'free',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE "user" (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email citext NOT NULL UNIQUE,
        password_hash text NOT NULL,
        role user_role_enum NOT NULL DEFAULT 'viewer',
        org_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
        is_verified boolean NOT NULL DEFAULT false,
        locked_until timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE login_history (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid REFERENCES "user"(id) ON DELETE CASCADE,
        ip_address inet,
        user_agent text,
        success boolean NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE refresh_token (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        token_hash text NOT NULL UNIQUE,
        expires_at timestamptz NOT NULL,
        revoked boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE workflow (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        title text NOT NULL,
        description text,
        status workflow_status_enum NOT NULL DEFAULT 'draft',
        current_version integer NOT NULL DEFAULT 0,
        org_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
        owner_id uuid NOT NULL REFERENCES "user"(id),
        domain text,
        tags text[] NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE workflow_version (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workflow_id uuid NOT NULL REFERENCES workflow(id) ON DELETE CASCADE,
        version_number integer NOT NULL,
        elements_json jsonb NOT NULL,
        elsa_json jsonb,
        confidence_score float,
        created_by uuid REFERENCES "user"(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_workflow_version_number UNIQUE (workflow_id, version_number)
      );

      CREATE TABLE session (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workflow_id uuid NOT NULL REFERENCES workflow(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES "user"(id),
        mode session_mode_enum NOT NULL,
        status session_status_enum NOT NULL DEFAULT 'created',
        confidence_score float NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        finalized_at timestamptz
      );

      CREATE TABLE message (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id uuid NOT NULL REFERENCES session(id) ON DELETE CASCADE,
        role message_role_enum NOT NULL,
        type message_type_enum NOT NULL,
        content text NOT NULL,
        metadata jsonb NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE document (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workflow_id uuid REFERENCES workflow(id) ON DELETE CASCADE,
        session_id uuid REFERENCES session(id) ON DELETE CASCADE,
        filename text NOT NULL,
        file_type text NOT NULL,
        storage_url text NOT NULL,
        extracted_text text,
        preprocessing_confidence float,
        doc_version integer NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE comment (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workflow_id uuid NOT NULL REFERENCES workflow(id) ON DELETE CASCADE,
        element_id text,
        author_id uuid NOT NULL REFERENCES "user"(id),
        type comment_type_enum NOT NULL,
        content text NOT NULL,
        resolved boolean NOT NULL DEFAULT false,
        resolved_at timestamptz,
        resolved_by uuid REFERENCES "user"(id),
        parent_id uuid REFERENCES comment(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE audit_log (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workflow_id uuid REFERENCES workflow(id) ON DELETE CASCADE,
        actor_id uuid,
        actor_type actor_type_enum NOT NULL,
        event_type varchar(128) NOT NULL,
        element_id text,
        before_state jsonb,
        after_state jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE kg_node (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id uuid NOT NULL REFERENCES session(id) ON DELETE CASCADE,
        type varchar(64) NOT NULL,
        label varchar(256) NOT NULL,
        properties jsonb NOT NULL DEFAULT '{}',
        confidence float,
        embedding vector(768),
        inferred boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE kg_edge (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id uuid NOT NULL REFERENCES session(id) ON DELETE CASCADE,
        from_node_id uuid NOT NULL REFERENCES kg_node(id) ON DELETE CASCADE,
        to_node_id uuid NOT NULL REFERENCES kg_node(id) ON DELETE CASCADE,
        relation_type varchar(64) NOT NULL,
        condition varchar(512),
        properties jsonb NOT NULL DEFAULT '{}',
        confidence float,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE process_pattern (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL UNIQUE,
        archetype_type text NOT NULL,
        description text,
        template_json jsonb NOT NULL,
        required_slots text[] NOT NULL DEFAULT '{}',
        embedding vector(768),
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE agent_definition (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar(128) NOT NULL UNIQUE,
        agent_type agent_type_enum NOT NULL,
        version varchar(32) NOT NULL DEFAULT '1.0.0',
        description text,
        capabilities jsonb NOT NULL DEFAULT '[]',
        default_config jsonb NOT NULL DEFAULT '{}',
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE pipeline_execution (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id uuid NOT NULL REFERENCES session(id) ON DELETE CASCADE,
        task_type pipeline_task_type_enum NOT NULL,
        mode varchar(16) NOT NULL CHECK (mode IN ('auto','interactive')),
        status pipeline_status_enum NOT NULL DEFAULT 'PENDING',
        input_payload jsonb NOT NULL DEFAULT '{}',
        retry_count smallint NOT NULL DEFAULT 0,
        last_checkpoint_agent agent_type_enum,
        triggered_by uuid REFERENCES "user"(id),
        nats_message_id varchar(256),
        started_at timestamptz,
        completed_at timestamptz,
        total_duration_ms integer,
        total_llm_calls integer NOT NULL DEFAULT 0,
        total_tokens_consumed integer NOT NULL DEFAULT 0,
        final_confidence float,
        error_summary text,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE agent_execution (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        pipeline_execution_id uuid NOT NULL REFERENCES pipeline_execution(id) ON DELETE CASCADE,
        agent_definition_id uuid NOT NULL REFERENCES agent_definition(id),
        status agent_execution_status_enum NOT NULL DEFAULT 'PENDING',
        order_index smallint NOT NULL,
        input_snapshot jsonb,
        output_snapshot jsonb,
        confidence_input float,
        confidence_output float,
        llm_calls_count smallint NOT NULL DEFAULT 0,
        tokens_consumed integer NOT NULL DEFAULT 0,
        error_message text,
        duration_ms integer,
        started_at timestamptz,
        completed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE agent_log (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_execution_id uuid NOT NULL REFERENCES agent_execution(id) ON DELETE CASCADE,
        log_level log_level_enum NOT NULL DEFAULT 'INFO',
        message text NOT NULL,
        metadata jsonb NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE agent_config_override (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_definition_id uuid NOT NULL REFERENCES agent_definition(id) ON DELETE CASCADE,
        scope_type config_override_scope_enum NOT NULL,
        scope_id uuid NOT NULL,
        config_patch jsonb NOT NULL,
        description text,
        created_by uuid NOT NULL REFERENCES "user"(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_agent_config_override_scope UNIQUE (agent_definition_id, scope_type, scope_id)
      );
    `);

    await queryRunner.query(`
      CREATE TABLE workflow_graph_snapshot (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workflow_id uuid NOT NULL REFERENCES workflow(id) ON DELETE CASCADE,
        workflow_version_id uuid REFERENCES workflow_version(id),
        session_id uuid REFERENCES session(id),
        graph_type graph_type_enum NOT NULL,
        source graph_source_enum NOT NULL,
        nodes jsonb NOT NULL DEFAULT '[]',
        edges jsonb NOT NULL DEFAULT '[]',
        node_count smallint NOT NULL DEFAULT 0,
        edge_count smallint NOT NULL DEFAULT 0,
        graph_embedding vector(768),
        created_by uuid REFERENCES "user"(id),
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE divergence_report (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workflow_id uuid NOT NULL REFERENCES workflow(id) ON DELETE CASCADE,
        graph_a_id uuid NOT NULL REFERENCES workflow_graph_snapshot(id),
        graph_b_id uuid NOT NULL REFERENCES workflow_graph_snapshot(id),
        comparison_type comparison_type_enum NOT NULL,
        status divergence_report_status_enum NOT NULL DEFAULT 'PENDING',
        overall_similarity float,
        severity divergence_severity_enum,
        algorithm_used varchar(64),
        total_points smallint NOT NULL DEFAULT 0,
        critical_count smallint NOT NULL DEFAULT 0,
        high_count smallint NOT NULL DEFAULT 0,
        medium_count smallint NOT NULL DEFAULT 0,
        low_count smallint NOT NULL DEFAULT 0,
        auto_triggered boolean NOT NULL DEFAULT false,
        triggered_by uuid REFERENCES "user"(id),
        pipeline_execution_id uuid REFERENCES pipeline_execution(id),
        completed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE divergence_point (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        report_id uuid NOT NULL REFERENCES divergence_report(id) ON DELETE CASCADE,
        point_type divergence_point_type_enum NOT NULL,
        severity point_severity_enum NOT NULL,
        element_id_in_a varchar(128),
        element_id_in_b varchar(128),
        element_label_a varchar(256),
        element_label_b varchar(256),
        description text NOT NULL,
        ai_suggestion text,
        auto_fixable boolean NOT NULL DEFAULT false,
        resolved boolean NOT NULL DEFAULT false,
        resolved_at timestamptz,
        resolved_by uuid REFERENCES "user"(id),
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE reconciliation_action (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        divergence_point_id uuid NOT NULL REFERENCES divergence_point(id) ON DELETE CASCADE,
        action_type reconciliation_action_type_enum NOT NULL,
        applied_by_user uuid REFERENCES "user"(id),
        applied_by_agent varchar(64),
        result_graph_snapshot_id uuid REFERENCES workflow_graph_snapshot(id),
        notes text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE rule (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
        workflow_id uuid REFERENCES workflow(id),
        name varchar(256) NOT NULL,
        description text,
        rule_type rule_type_enum NOT NULL,
        scope rule_scope_enum NOT NULL DEFAULT 'ORG',
        target_agent agent_type_enum,
        condition jsonb,
        instruction text NOT NULL,
        priority smallint NOT NULL DEFAULT 100,
        version smallint NOT NULL DEFAULT 1,
        is_active boolean NOT NULL DEFAULT true,
        created_by uuid NOT NULL REFERENCES "user"(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE rule_version (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        rule_id uuid NOT NULL REFERENCES rule(id) ON DELETE CASCADE,
        version smallint NOT NULL,
        instruction text NOT NULL,
        condition jsonb,
        changed_by uuid NOT NULL REFERENCES "user"(id),
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE skill (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
        name varchar(256) NOT NULL,
        description text,
        skill_type skill_type_enum NOT NULL,
        content jsonb NOT NULL,
        embedding vector(768),
        applies_to_domains text[],
        applies_to_agents agent_type_enum[],
        is_active boolean NOT NULL DEFAULT true,
        is_mandatory boolean NOT NULL DEFAULT false,
        usage_count integer NOT NULL DEFAULT 0,
        version smallint NOT NULL DEFAULT 1,
        created_by uuid NOT NULL REFERENCES "user"(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE rule_application (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        rule_id uuid NOT NULL REFERENCES rule(id) ON DELETE CASCADE,
        rule_version smallint NOT NULL,
        agent_execution_id uuid NOT NULL REFERENCES agent_execution(id) ON DELETE CASCADE,
        triggered boolean NOT NULL,
        impact_description text,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE skill_application (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        skill_id uuid NOT NULL REFERENCES skill(id) ON DELETE CASCADE,
        agent_execution_id uuid NOT NULL REFERENCES agent_execution(id) ON DELETE CASCADE,
        retrieval_rank smallint,
        similarity_score float,
        injected_tokens smallint NOT NULL DEFAULT 0,
        was_mandatory boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX idx_user_org_id ON "user" (org_id);
      CREATE INDEX idx_login_history_user_created ON login_history (user_id, created_at DESC);
      CREATE INDEX idx_refresh_token_user_revoked ON refresh_token (user_id, revoked);
      CREATE INDEX idx_workflow_org_status ON workflow (org_id, status);
      CREATE INDEX idx_workflow_owner ON workflow (owner_id);
      CREATE INDEX idx_workflow_tags ON workflow USING gin (tags);
      CREATE INDEX idx_workflow_version_workflow_number ON workflow_version (workflow_id, version_number DESC);
      CREATE INDEX idx_session_workflow_created ON session (workflow_id, created_at DESC);
      CREATE INDEX idx_session_user ON session (user_id);
      CREATE INDEX idx_message_session_created ON message (session_id, created_at);
      CREATE INDEX idx_audit_log_workflow_created ON audit_log (workflow_id, created_at);
      CREATE INDEX idx_kg_node_session_type ON kg_node (session_id, type);
      CREATE INDEX idx_kg_node_embedding ON kg_node USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
      CREATE INDEX idx_kg_edge_session ON kg_edge (session_id);
      CREATE INDEX idx_process_pattern_embedding ON process_pattern USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);
      CREATE INDEX idx_comment_workflow_resolved ON comment (workflow_id, resolved);
      CREATE INDEX idx_pipeline_execution_session_created ON pipeline_execution (session_id, created_at DESC);
      CREATE INDEX idx_pipeline_execution_status ON pipeline_execution (status);
      CREATE INDEX idx_agent_execution_pipeline_order ON agent_execution (pipeline_execution_id, order_index ASC);
      CREATE INDEX idx_agent_execution_definition_status ON agent_execution (agent_definition_id, status);
      CREATE INDEX idx_agent_execution_status_created ON agent_execution (status, created_at DESC);
      CREATE INDEX idx_agent_execution_definition_created ON agent_execution (agent_definition_id, created_at DESC);
      CREATE INDEX idx_agent_log_execution_created ON agent_log (agent_execution_id, created_at ASC);
      CREATE INDEX idx_agent_config_override_lookup ON agent_config_override (agent_definition_id, scope_type, scope_id);
      CREATE INDEX idx_workflow_graph_snapshot_workflow_type ON workflow_graph_snapshot (workflow_id, graph_type);
      CREATE INDEX idx_workflow_graph_snapshot_session ON workflow_graph_snapshot (session_id);
      CREATE INDEX idx_workflow_graph_snapshot_embedding ON workflow_graph_snapshot USING ivfflat (graph_embedding vector_cosine_ops) WITH (lists = 50);
      CREATE INDEX idx_divergence_report_workflow_created ON divergence_report (workflow_id, created_at DESC);
      CREATE INDEX idx_divergence_report_status ON divergence_report (status);
      CREATE INDEX idx_divergence_point_report_severity ON divergence_point (report_id, severity);
      CREATE INDEX idx_divergence_point_report_resolved ON divergence_point (report_id, resolved);
      CREATE INDEX idx_reconciliation_action_point ON reconciliation_action (divergence_point_id);
      CREATE INDEX idx_rule_org_active_scope ON rule (org_id, is_active, scope);
      CREATE INDEX idx_rule_org_target_active ON rule (org_id, target_agent, is_active);
      CREATE INDEX idx_rule_workflow_partial ON rule (workflow_id) WHERE workflow_id IS NOT NULL;
      CREATE INDEX idx_skill_org_active_type ON skill (org_id, is_active, skill_type);
      CREATE INDEX idx_skill_org_mandatory ON skill (org_id, is_mandatory) WHERE is_mandatory = true;
      CREATE INDEX idx_skill_embedding ON skill USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
      CREATE INDEX idx_rule_application_agent_execution ON rule_application (agent_execution_id);
      CREATE INDEX idx_rule_application_rule_created ON rule_application (rule_id, created_at DESC);
      CREATE INDEX idx_skill_application_agent_execution ON skill_application (agent_execution_id);
      CREATE INDEX idx_skill_application_skill_created ON skill_application (skill_id, created_at DESC);
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'audit_log rows are immutable';
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER trg_prevent_audit_log_update
      BEFORE UPDATE ON audit_log
      FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

      CREATE TRIGGER trg_prevent_audit_log_delete
      BEFORE DELETE ON audit_log
      FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

      CREATE OR REPLACE FUNCTION enforce_workflow_current_version()
      RETURNS trigger AS $$
      DECLARE
        max_version integer;
      BEGIN
        SELECT COALESCE(MAX(version_number), 0)
          INTO max_version
          FROM workflow_version
         WHERE workflow_id = NEW.id;

        IF NEW.current_version > max_version THEN
          RAISE EXCEPTION 'workflow.current_version cannot exceed latest workflow_version.version_number';
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER trg_enforce_workflow_current_version
      BEFORE INSERT OR UPDATE OF current_version ON workflow
      FOR EACH ROW EXECUTE FUNCTION enforce_workflow_current_version();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_enforce_workflow_current_version ON workflow;
      DROP FUNCTION IF EXISTS enforce_workflow_current_version;
      DROP TRIGGER IF EXISTS trg_prevent_audit_log_delete ON audit_log;
      DROP TRIGGER IF EXISTS trg_prevent_audit_log_update ON audit_log;
      DROP FUNCTION IF EXISTS prevent_audit_log_mutation;

      DROP TABLE IF EXISTS skill_application CASCADE;
      DROP TABLE IF EXISTS rule_application CASCADE;
      DROP TABLE IF EXISTS skill CASCADE;
      DROP TABLE IF EXISTS rule_version CASCADE;
      DROP TABLE IF EXISTS rule CASCADE;
      DROP TABLE IF EXISTS reconciliation_action CASCADE;
      DROP TABLE IF EXISTS divergence_point CASCADE;
      DROP TABLE IF EXISTS divergence_report CASCADE;
      DROP TABLE IF EXISTS workflow_graph_snapshot CASCADE;
      DROP TABLE IF EXISTS agent_config_override CASCADE;
      DROP TABLE IF EXISTS agent_log CASCADE;
      DROP TABLE IF EXISTS agent_execution CASCADE;
      DROP TABLE IF EXISTS pipeline_execution CASCADE;
      DROP TABLE IF EXISTS agent_definition CASCADE;
      DROP TABLE IF EXISTS process_pattern CASCADE;
      DROP TABLE IF EXISTS kg_edge CASCADE;
      DROP TABLE IF EXISTS kg_node CASCADE;
      DROP TABLE IF EXISTS audit_log CASCADE;
      DROP TABLE IF EXISTS comment CASCADE;
      DROP TABLE IF EXISTS document CASCADE;
      DROP TABLE IF EXISTS message CASCADE;
      DROP TABLE IF EXISTS session CASCADE;
      DROP TABLE IF EXISTS workflow_version CASCADE;
      DROP TABLE IF EXISTS workflow CASCADE;
      DROP TABLE IF EXISTS refresh_token CASCADE;
      DROP TABLE IF EXISTS login_history CASCADE;
      DROP TABLE IF EXISTS "user" CASCADE;
      DROP TABLE IF EXISTS organization CASCADE;

      DROP TYPE IF EXISTS skill_type_enum CASCADE;
      DROP TYPE IF EXISTS rule_scope_enum CASCADE;
      DROP TYPE IF EXISTS rule_type_enum CASCADE;
      DROP TYPE IF EXISTS reconciliation_action_type_enum CASCADE;
      DROP TYPE IF EXISTS point_severity_enum CASCADE;
      DROP TYPE IF EXISTS divergence_point_type_enum CASCADE;
      DROP TYPE IF EXISTS divergence_report_status_enum CASCADE;
      DROP TYPE IF EXISTS divergence_severity_enum CASCADE;
      DROP TYPE IF EXISTS comparison_type_enum CASCADE;
      DROP TYPE IF EXISTS graph_source_enum CASCADE;
      DROP TYPE IF EXISTS graph_type_enum CASCADE;
      DROP TYPE IF EXISTS config_override_scope_enum CASCADE;
      DROP TYPE IF EXISTS log_level_enum CASCADE;
      DROP TYPE IF EXISTS agent_execution_status_enum CASCADE;
      DROP TYPE IF EXISTS pipeline_status_enum CASCADE;
      DROP TYPE IF EXISTS pipeline_task_type_enum CASCADE;
      DROP TYPE IF EXISTS agent_type_enum CASCADE;
      DROP TYPE IF EXISTS actor_type_enum CASCADE;
      DROP TYPE IF EXISTS comment_type_enum CASCADE;
      DROP TYPE IF EXISTS message_type_enum CASCADE;
      DROP TYPE IF EXISTS message_role_enum CASCADE;
      DROP TYPE IF EXISTS session_status_enum CASCADE;
      DROP TYPE IF EXISTS session_mode_enum CASCADE;
      DROP TYPE IF EXISTS workflow_status_enum CASCADE;
      DROP TYPE IF EXISTS user_role_enum CASCADE;
    `);
  }
}
