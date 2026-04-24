import { MigrationInterface, QueryRunner } from 'typeorm';

const agents = [
  ['Orchestrator Agent v1', 'ORCHESTRATOR', {}],
  ['Intake Agent v1', 'INTAKE', {}],
  [
    'Extraction Agent v1',
    'EXTRACTION',
    {
      temperature: 0.1,
      max_tokens: 2048,
      output_schema_version: 'v1',
      confidence_minimum: 0.5,
    },
  ],
  [
    'Pattern Agent v1',
    'PATTERN',
    {
      similarity_threshold: 0.72,
      max_candidates: 5,
      fallback_to_generic: true,
    },
  ],
  [
    'Gap Detection Agent v1',
    'GAP_DETECTION',
    {
      critical_gap_auto_block: false,
    },
  ],
  [
    'Qa Agent v1',
    'QA',
    {
      max_rounds: 5,
      max_questions_per_round: 3,
      skip_allowed: true,
    },
  ],
  [
    'Validation Agent v1',
    'VALIDATION',
    {
      confidence_exit_threshold: 0.85,
      require_all_critical_resolved: true,
    },
  ],
  [
    'Export Agent v1',
    'EXPORT',
    {
      default_formats: ['elsa', 'bpmn'],
      include_decision_log_in_pdf: true,
    },
  ],
  [
    'Divergence Agent v1',
    'DIVERGENCE',
    {
      similarity_threshold: 0.85,
      path_depth_limit: 12,
      reconciliation_llm: true,
    },
  ],
  [
    'Rules Skills Loader Agent v1',
    'RULES_SKILLS_LOADER',
    {
      top_k_skills: 3,
      mandatory_actor_catalog: true,
    },
  ],
] as const;

const processPatterns = [
  [
    'Approval',
    'approval',
    'Routes work to an approver before continuing.',
    {
      nodes: [
        { type: 'task', label: 'Submit' },
        { type: 'approval', label: 'Approve' },
      ],
      edges: [{ from: 0, to: 1 }],
    },
    ['requester', 'approver', 'approval_decision'],
  ],
  [
    'Escalation',
    'escalation',
    'Escalates unresolved or overdue work to a higher authority.',
    {
      nodes: [
        { type: 'task', label: 'Review' },
        { type: 'timer', label: 'SLA Breach' },
        { type: 'task', label: 'Escalate' },
      ],
      edges: [
        { from: 0, to: 1 },
        { from: 1, to: 2 },
      ],
    },
    ['owner', 'escalation_target', 'sla'],
  ],
  [
    'Parallel Review',
    'parallel_review',
    'Runs multiple review branches before joining the result.',
    {
      nodes: [
        { type: 'split', label: 'Start Reviews' },
        { type: 'task', label: 'Review A' },
        { type: 'task', label: 'Review B' },
        { type: 'join', label: 'Consolidate' },
      ],
      edges: [
        { from: 0, to: 1 },
        { from: 0, to: 2 },
        { from: 1, to: 3 },
        { from: 2, to: 3 },
      ],
    },
    ['reviewers', 'join_condition'],
  ],
  [
    'Notification',
    'notification',
    'Notifies an actor or system when a business event occurs.',
    {
      nodes: [
        { type: 'event', label: 'Event Occurs' },
        { type: 'notification', label: 'Notify Stakeholder' },
      ],
      edges: [{ from: 0, to: 1 }],
    },
    ['recipient', 'channel', 'message'],
  ],
  [
    'Periodic Execution',
    'periodic_execution',
    'Runs a process on a recurring schedule.',
    {
      nodes: [
        { type: 'timer', label: 'Schedule' },
        { type: 'task', label: 'Execute Job' },
      ],
      edges: [{ from: 0, to: 1 }],
    },
    ['schedule', 'executor'],
  ],
  [
    'Onboarding',
    'onboarding',
    'Collects information, provisions access, and confirms completion for a new participant.',
    {
      nodes: [
        { type: 'task', label: 'Collect Details' },
        { type: 'task', label: 'Provision Access' },
        { type: 'task', label: 'Confirm Completion' },
      ],
      edges: [
        { from: 0, to: 1 },
        { from: 1, to: 2 },
      ],
    },
    ['participant', 'access_owner', 'completion_criteria'],
  ],
] as const;

export class SeedAgentDefinitions1700000001000 implements MigrationInterface {
  name = 'SeedAgentDefinitions1700000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [name, agentType, defaultConfig] of agents) {
      await queryRunner.query(
        `
          INSERT INTO agent_definition (name, agent_type, version, capabilities, default_config, is_active)
          VALUES ($1, $2::agent_type_enum, '1.0.0', '[]'::jsonb, $3::jsonb, true)
          ON CONFLICT (name) DO UPDATE
            SET default_config = EXCLUDED.default_config,
                agent_type = EXCLUDED.agent_type,
                updated_at = now()
        `,
        [name, agentType, JSON.stringify(defaultConfig)],
      );
    }

    for (const [name, archetypeType, description, templateJson, requiredSlots] of processPatterns) {
      await queryRunner.query(
        `
          INSERT INTO process_pattern (name, archetype_type, description, template_json, required_slots)
          VALUES ($1, $2, $3, $4::jsonb, $5::text[])
          ON CONFLICT (name) DO UPDATE
            SET archetype_type = EXCLUDED.archetype_type,
                description = EXCLUDED.description,
                template_json = EXCLUDED.template_json,
                required_slots = EXCLUDED.required_slots
        `,
        [name, archetypeType, description, JSON.stringify(templateJson), requiredSlots],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM process_pattern WHERE name = ANY($1::varchar[])`, [
      processPatterns.map(([name]) => name),
    ]);
    await queryRunner.query(`DELETE FROM agent_definition WHERE name = ANY($1::varchar[])`, [
      agents.map(([name]) => name),
    ]);
  }
}
