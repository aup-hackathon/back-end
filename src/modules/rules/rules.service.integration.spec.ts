import { randomUUID } from 'crypto';

import { DataType, newDb } from 'pg-mem';
import { DataSource } from 'typeorm';

import { RulesService } from './rules.service';

describe('RulesService integration', () => {
  let dataSource: DataSource;

  const caller = {
    id: '11111111-1111-4111-8111-111111111111',
    orgId: '00000000-0000-4000-8000-000000000001',
    role: 'admin',
  };

  beforeAll(async () => {
    const db = newDb({ autoCreateForeignKeyIndices: true });
    db.public.registerFunction({
      name: 'current_database',
      returns: DataType.text,
      implementation: () => 'flowforge_test',
    });
    db.public.registerFunction({
      name: 'version',
      returns: DataType.text,
      implementation: () => 'PostgreSQL 16.0',
    });
    db.public.registerFunction({
      name: 'gen_random_uuid',
      returns: DataType.uuid,
      implementation: () => randomUUID(),
    });
    db.public.registerFunction({
      name: 'uuid_generate_v4',
      returns: DataType.uuid,
      implementation: () => randomUUID(),
    });

    dataSource = await db.adapters.createTypeormDataSource({
      type: 'postgres',
      entities: [],
      synchronize: false,
    });
    await dataSource.initialize();

    await dataSource.query(`
      CREATE TABLE workflow (
        id uuid PRIMARY KEY,
        org_id uuid NOT NULL
      );

      CREATE TABLE session (
        id uuid PRIMARY KEY,
        workflow_id uuid NOT NULL
      );

      CREATE TABLE pipeline_execution (
        id uuid PRIMARY KEY,
        session_id uuid NOT NULL
      );

      CREATE TABLE agent_execution (
        id uuid PRIMARY KEY,
        pipeline_execution_id uuid NOT NULL
      );

      CREATE TABLE rule (
        id uuid PRIMARY KEY,
        name text NOT NULL,
        rule_type text NOT NULL
      );

      CREATE TABLE rule_application (
        id uuid PRIMARY KEY,
        rule_id uuid NOT NULL,
        rule_version smallint NOT NULL,
        agent_execution_id uuid NOT NULL,
        triggered boolean NOT NULL,
        impact_description text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
  });

  beforeEach(async () => {
    await dataSource.query('DELETE FROM rule_application');
    await dataSource.query('DELETE FROM agent_execution');
    await dataSource.query('DELETE FROM pipeline_execution');
    await dataSource.query('DELETE FROM session');
    await dataSource.query('DELETE FROM workflow');
    await dataSource.query('DELETE FROM rule');
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('returns only RuleApplication rows for the requested agent execution', async () => {
    await dataSource.query(
      `
        INSERT INTO workflow (id, org_id) VALUES ($1, $2);
        INSERT INTO session (id, workflow_id) VALUES ($3, $1);
        INSERT INTO pipeline_execution (id, session_id) VALUES ($4, $3);
        INSERT INTO agent_execution (id, pipeline_execution_id) VALUES ($5, $4), ($6, $4);
        INSERT INTO rule (id, name, rule_type) VALUES ($7, 'Invoice extractor rule', 'EXTRACTION');
        INSERT INTO rule (id, name, rule_type) VALUES ($8, 'Validation rule', 'VALIDATION');
        INSERT INTO rule_application (
          id,
          rule_id,
          rule_version,
          agent_execution_id,
          triggered,
          impact_description
        ) VALUES
          ($9, $7, 1, $5, true, 'Added finance actor'),
          ($10, $8, 1, $6, false, 'No impact');
      `,
      [
        '11111111-1111-4111-8111-111111111110',
        caller.orgId,
        '22222222-2222-4222-8222-222222222222',
        '33333333-3333-4333-8333-333333333333',
        '44444444-4444-4444-8444-444444444444',
        '55555555-5555-4555-8555-555555555555',
        '66666666-6666-4666-8666-666666666666',
        '77777777-7777-4777-8777-777777777777',
        '88888888-8888-4888-8888-888888888888',
        '99999999-9999-4999-8999-999999999999',
      ],
    );

    const agentExecutionsRepository = {
      findOne: jest.fn(async ({ where: { id } }: { where: { id: string } }) => {
        const rows = await dataSource.query('SELECT id FROM agent_execution WHERE id = $1', [id]);
        return rows[0] ?? null;
      }),
    };

    const service = new RulesService(
      { create: jest.fn(), save: jest.fn(), find: jest.fn(), findOne: jest.fn() } as never,
      { insert: jest.fn(), find: jest.fn() } as never,
      { query: (query: string, params: unknown[]) => dataSource.query(query, params) } as never,
      { findOne: jest.fn() } as never,
      { findOne: jest.fn() } as never,
      agentExecutionsRepository as never,
      { transaction: jest.fn() } as never,
      { emitToRoom: jest.fn() } as never,
      { get: jest.fn() } as never,
      { log: jest.fn() } as never,
    );

    const result = await service.listRuleApplicationsForAgentExecution(
      '44444444-4444-4444-8444-444444444444',
      caller.orgId,
    );

    expect(result.applications).toHaveLength(1);
    expect(result.applications[0]).toEqual(
      expect.objectContaining({
        id: '88888888-8888-4888-8888-888888888888',
        rule_id: '66666666-6666-4666-8666-666666666666',
        agent_execution_id: '44444444-4444-4444-8444-444444444444',
      }),
    );
  });
});
