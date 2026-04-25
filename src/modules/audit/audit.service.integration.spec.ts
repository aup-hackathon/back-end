import { randomUUID } from 'crypto';

import { DataType, newDb } from 'pg-mem';
import { DataSource, Repository } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

import { ActorType, UserRole, WorkflowStatus } from '../../database/enums';
import { Workflow } from '../workflows/entities/workflow.entity';
import { AuditLogExportFormat } from './dto/audit-log-export-query.dto';
import { AuditLog } from './entities/audit-log.entity';
import { AuditService } from './audit.service';

describe('AuditService integration', () => {
  let dataSource: DataSource;
  let auditLogRepository: Repository<AuditLog>;
  let workflowRepository: Repository<Workflow>;
  let service: AuditService;

  const currentUser = {
    id: '11111111-1111-4111-8111-111111111111',
    orgId: '00000000-0000-4000-8000-000000000001',
    role: UserRole.BUSINESS_ANALYST,
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
      entities: [AuditLog, Workflow],
      namingStrategy: new SnakeNamingStrategy(),
      synchronize: true,
    });
    await dataSource.initialize();

    auditLogRepository = dataSource.getRepository(AuditLog);
    workflowRepository = dataSource.getRepository(Workflow);
    service = new AuditService(auditLogRepository, workflowRepository);
  });

  beforeEach(async () => {
    await auditLogRepository.clear();
    await workflowRepository.clear();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('filters by date range and paginates audit log results', async () => {
    const workflow = await createWorkflow();
    await seedAuditEntries(workflow.id);

    const firstPage = await service.getWorkflowAuditLog(workflow.id, currentUser, {
      from: '2026-04-21T00:00:00.000Z',
      to: '2026-04-22T23:59:59.999Z',
      page: 1,
      limit: 1,
    });
    const secondPage = await service.getWorkflowAuditLog(workflow.id, currentUser, {
      from: '2026-04-21T00:00:00.000Z',
      to: '2026-04-22T23:59:59.999Z',
      page: 2,
      limit: 1,
    });

    expect(firstPage.total).toBe(2);
    expect(firstPage.entries).toHaveLength(1);
    expect(firstPage.entries[0].eventType).toBe('ANSWER_APPLIED');
    expect(secondPage.entries).toHaveLength(1);
    expect(secondPage.entries[0].eventType).toBe('WORKFLOW_UPDATED');
  });

  it('returns only interpretation and inference events in the decision log', async () => {
    const workflow = await createWorkflow();
    await seedAuditEntries(workflow.id);

    const result = await service.getDecisionLog(workflow.id, currentUser, {
      page: 1,
      limit: 10,
    });

    expect(result.entries.map((entry) => entry.eventType)).toEqual([
      'ANSWER_APPLIED',
      'PATTERN_MATCHED',
    ]);
  });

  it('exports filtered audit entries as csv and pdf', async () => {
    const workflow = await createWorkflow();
    await seedAuditEntries(workflow.id);

    const csv = await service.exportWorkflowAuditLog(workflow.id, currentUser, {
      format: AuditLogExportFormat.CSV,
      type: 'ai_decision',
    });
    const pdf = await service.exportWorkflowAuditLog(workflow.id, currentUser, {
      format: AuditLogExportFormat.PDF,
      type: 'ai_decision',
    });

    const csvText = csv.buffer.toString('utf8');

    expect(csv.contentType).toContain('text/csv');
    expect(csvText).toContain('PATTERN_MATCHED');
    expect(csvText).toContain('ANSWER_APPLIED');
    expect(csvText).not.toContain('WORKFLOW_UPDATED');
    expect(pdf.buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
  });

  async function createWorkflow() {
    return workflowRepository.save(
      workflowRepository.create({
        id: '22222222-2222-4222-8222-222222222222',
        title: 'Claims intake',
        description: null,
        status: WorkflowStatus.DRAFT,
        currentVersion: 1,
        orgId: currentUser.orgId,
        ownerId: currentUser.id,
        domain: null,
        tags: [],
      }),
    );
  }

  async function seedAuditEntries(workflowId: string) {
    return Promise.all([
      auditLogRepository.save(
        auditLogRepository.create({
          id: '33333333-3333-4333-8333-333333333331',
          workflowId,
          actorId: currentUser.id,
          actorType: ActorType.USER,
          eventType: 'PATTERN_MATCHED',
          beforeState: null,
          afterState: { pattern: 'approval_flow' },
          createdAt: new Date('2026-04-20T10:00:00.000Z'),
        }),
      ),
      auditLogRepository.save(
        auditLogRepository.create({
          id: '33333333-3333-4333-8333-333333333332',
          workflowId,
          actorId: currentUser.id,
          actorType: ActorType.USER,
          eventType: 'WORKFLOW_UPDATED',
          beforeState: { title: 'Claims intake' },
          afterState: { title: 'Claims intake v2' },
          createdAt: new Date('2026-04-21T10:00:00.000Z'),
        }),
      ),
      auditLogRepository.save(
        auditLogRepository.create({
          id: '33333333-3333-4333-8333-333333333333',
          workflowId,
          actorId: currentUser.id,
          actorType: ActorType.USER,
          eventType: 'ANSWER_APPLIED',
          beforeState: { missing: 'approver' },
          afterState: { approver: 'manager' },
          createdAt: new Date('2026-04-22T10:00:00.000Z'),
        }),
      ),
    ]);
  }
});
