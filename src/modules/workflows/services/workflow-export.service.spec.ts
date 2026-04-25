import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';

import { Workflow } from '../entities/workflow.entity';
import { WorkflowVersion } from '../entities/workflow-version.entity';
import { Session } from '../../sessions/entities/session.entity';
import { DivergenceReport } from '../../divergence/entities/divergence-report.entity';
import { DivergencePoint } from '../../divergence/entities/divergence-point.entity';
import { Message } from '../../messages/entities/message.entity';
import { AuditService } from '../../audit/audit.service';
import { PipelineExecution } from '../../agents/entities/pipeline-execution.entity';
import {
  DivergenceReportStatus,
  WorkflowStatus,
  SessionStatus,
} from '../../../database/enums';
import { WorkflowsService } from '../workflows.service';
import { ElsaMappingService } from './elsa-mapping.service';
import { WorkflowExportService } from './workflow-export.service';
import { NatsPublisherService } from '../../../infra/nats/nats.publisher.service';

describe('WorkflowExportService', () => {
  let service: WorkflowExportService;
  let workflowRepo: jest.Mocked<Repository<Workflow>>;
  let versionRepo: jest.Mocked<Repository<WorkflowVersion>>;
  let sessionRepo: jest.Mocked<Repository<Session>>;
  let divergenceReportRepo: jest.Mocked<Repository<DivergenceReport>>;
  let divergencePointRepo: jest.Mocked<Repository<DivergencePoint>>;
  let messageRepo: jest.Mocked<Repository<Message>>;
  let auditService: { log: jest.Mock; listDecisionEntriesForWorkflow: jest.Mock };
  let pipelineExecutionRepo: jest.Mocked<Repository<PipelineExecution>>;

  const mockWorkflow: Partial<Workflow> = {
    id: 'workflow-123',
    title: 'Test Workflow',
    status: WorkflowStatus.VALIDATED,
    currentVersion: 1,
    ownerId: 'user-123',
    orgId: 'org-123',
  };

  const mockVersion: Partial<WorkflowVersion> = {
    id: 'version-123',
    workflowId: 'workflow-123',
    versionNumber: 1,
    elementsJson: { nodes: [{ id: 'node1', type: 'start_event' }] },
  };

  const mockSession: Partial<Session> = {
    id: 'session-123',
    workflowId: 'workflow-123',
    userId: 'user-123',
    status: SessionStatus.VALIDATED,
  };

  const mockSessionNeedsReconciliation: Partial<Session> = {
    id: 'session-456',
    workflowId: 'workflow-123',
    userId: 'user-123',
    status: SessionStatus.NEEDS_RECONCILIATION,
  };

  const mockDivergenceReport: Partial<DivergenceReport> = {
    id: 'report-123',
    workflowId: 'workflow-123',
    status: DivergenceReportStatus.COMPLETED,
  };

  beforeEach(async () => {
    mockWorkflow.status = WorkflowStatus.VALIDATED;
    mockSession.status = SessionStatus.VALIDATED;

    const mockWorkflowsService = {
      findOneWithLatestVersion: jest.fn().mockResolvedValue(mockWorkflow),
    };

    const mockNatsPublisher = {
      publish: jest.fn().mockResolvedValue(undefined),
    };
    const mockAuditService = {
      log: jest.fn().mockResolvedValue({}),
      listDecisionEntriesForWorkflow: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowExportService,
        ElsaMappingService,
        { provide: WorkflowsService, useValue: mockWorkflowsService },
        { provide: NatsPublisherService, useValue: mockNatsPublisher },
        { provide: AuditService, useValue: mockAuditService },
        { provide: getRepositoryToken(Workflow), useValue: { findOne: jest.fn(), update: jest.fn(), save: jest.fn() } },
        { provide: getRepositoryToken(WorkflowVersion), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(Session), useValue: { findOne: jest.fn(), findOneOrFail: jest.fn() } },
        { provide: getRepositoryToken(DivergenceReport), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(DivergencePoint), useValue: { count: jest.fn() } },
        { provide: getRepositoryToken(Message), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(PipelineExecution), useValue: { create: jest.fn((value) => value), save: jest.fn() } },
      ],
    }).compile();

    service = module.get<WorkflowExportService>(WorkflowExportService);
    workflowRepo = module.get(getRepositoryToken(Workflow));
    versionRepo = module.get(getRepositoryToken(WorkflowVersion));
    sessionRepo = module.get(getRepositoryToken(Session));
    divergenceReportRepo = module.get(getRepositoryToken(DivergenceReport));
    divergencePointRepo = module.get(getRepositoryToken(DivergencePoint));
    messageRepo = module.get(getRepositoryToken(Message));
    auditService = module.get(AuditService);
    pipelineExecutionRepo = module.get(getRepositoryToken(PipelineExecution));
  });

  describe('validateExportability', () => {
    it('should allow export when workflow is VALIDATED and no unresolved critical points', async () => {
      sessionRepo.findOne.mockResolvedValue(mockSession as Session);
      divergenceReportRepo.findOne.mockResolvedValue(null);

      const result = await service.validateExportability('workflow-123', 'org-123', 'user-123', 'admin');

      expect(result.canExport).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should block export when workflow status is not VALIDATED (409 Conflict)', async () => {
      mockWorkflow.status = WorkflowStatus.DRAFT;
      sessionRepo.findOne.mockResolvedValue(mockSession as Session);

      const result = await service.validateExportability('workflow-123', 'org-123', 'user-123', 'admin');

      expect(result.canExport).toBe(false);
      expect(result.reason).toBe('INVALID_STATUS');
    });

    it('should block export when session status is NEEDS_RECONCILIATION (409 Conflict with RECONCILIATION_REQUIRED)', async () => {
      sessionRepo.findOne.mockResolvedValue(mockSessionNeedsReconciliation as Session);

      const result = await service.validateExportability('workflow-123', 'org-123', 'user-123', 'admin');

      expect(result.canExport).toBe(false);
      expect(result.reason).toBe('RECONCILIATION_REQUIRED');
    });

    it('should block export when critical unresolved divergence points exist (409 Conflict with RECONCILIATION_REQUIRED)', async () => {
      sessionRepo.findOne.mockResolvedValue(mockSession as Session);
      divergenceReportRepo.findOne.mockResolvedValue(mockDivergenceReport as DivergenceReport);
      divergencePointRepo.count.mockResolvedValue(2);

      const result = await service.validateExportability('workflow-123', 'org-123', 'user-123', 'admin');

      expect(result.canExport).toBe(false);
      expect(result.reason).toBe('RECONCILIATION_REQUIRED');
      expect(result.unresolvedCriticalPoints).toBe(2);
    });

    it('should block export for non-owner non-admin non-business_analyst users (403 Forbidden)', async () => {
      sessionRepo.findOne.mockResolvedValue(mockSession as Session);

      const result = await service.validateExportability('workflow-123', 'org-123', 'other-user', 'viewer');

      expect(result.canExport).toBe(false);
      expect(result.reason).toBe('FORBIDDEN');
    });

    it('should allow business_analyst role to export others workflows', async () => {
      mockWorkflow.status = WorkflowStatus.VALIDATED;
      sessionRepo.findOne.mockResolvedValue(mockSession as Session);
      divergenceReportRepo.findOne.mockResolvedValue(null);

      const result = await service.validateExportability('workflow-123', 'org-123', 'business-analyst-user', 'business_analyst');

      expect(result.canExport).toBe(true);
    });

    it('should allow admin role to export others workflows', async () => {
      mockWorkflow.status = WorkflowStatus.VALIDATED;
      sessionRepo.findOne.mockResolvedValue(mockSession as Session);
      divergenceReportRepo.findOne.mockResolvedValue(null);

      const result = await service.validateExportability('workflow-123', 'org-123', 'admin-user', 'admin');

      expect(result.canExport).toBe(true);
    });
  });

  describe('exportToElsa', () => {
    it('should successfully export to Elsa format', async () => {
      versionRepo.findOne.mockResolvedValue(mockVersion as WorkflowVersion);
      workflowRepo.findOne.mockResolvedValue(mockWorkflow as Workflow);
      workflowRepo.update.mockResolvedValue({ affected: 1 } as any);

      const result = await service.exportToElsa('workflow-123', 1, 'user-123', 'org-123');

      expect(result.json).toBeDefined();
      expect(result.filename).toContain('elsa');
      expect(result.artifactUri).toContain('exports/org-123/workflow-123');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'WORKFLOW_EXPORTED' }),
      );
    });

    it('should throw NotFoundException when version not found', async () => {
      versionRepo.findOne.mockResolvedValue(null);

      await expect(service.exportToElsa('workflow-123', 999, 'user-123', 'org-123')).rejects.toThrow(NotFoundException);
    });
  });

  describe('exportToBpmnAsync', () => {
    it('should create pipeline execution', async () => {
      pipelineExecutionRepo.save.mockResolvedValue({
        id: 'pipeline-123',
      } as unknown as PipelineExecution);

      await service.exportToBpmnAsync('workflow-123', 1, 'user-123', 'org-123', 'corr-123');

      expect(pipelineExecutionRepo.save).toHaveBeenCalled();
    });
  });
});
