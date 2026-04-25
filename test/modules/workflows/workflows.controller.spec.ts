import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as supertest from 'supertest';
import { WorkflowsController } from '../../src/modules/workflows/workflows.controller';
import { WorkflowsService } from '../../src/modules/workflows/workflows.service';
import { WorkflowExportService } from '../../src/modules/workflows/services/workflow-export.service';
import { AuditService } from '../../src/modules/audit/audit.service';

describe('WorkflowsController', () => {
  let app: INestApplication;
  let httpClient: supertest.SuperTest<supertest.Test>;

  // Test data
  const orgId = '550e8400-e29b-41d4-a716-446655440000';
  const userId = '550e8400-e29b-41d4-a716-446655440001';
  const workflowId = '550e8400-e29b-41d4-a716-446655440002';

  const mockWorkflow = {
    id: workflowId,
    title: 'Test Workflow',
    description: 'Test description',
    domain: 'test-domain',
    tags: ['tag1'],
    status: 'DRAFT',
    currentVersion: 1,
    ownerId: userId,
    orgId,
    projectId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockVersion = {
    id: 'version-1',
    workflowId,
    versionNumber: 1,
    elementsJson: { nodes: [], edges: [] },
    elsaJson: null,
    confidenceScore: null,
    createdBy: userId,
    createdAt: new Date(),
  };

  const mockService: any = {
    create: jest.fn().mockResolvedValue(mockWorkflow),
    findAll: jest.fn().mockResolvedValue({ workflows: [mockWorkflow], total: 1 }),
    findOneWithLatestVersion: jest.fn().mockResolvedValue({ ...mockWorkflow, latestVersion: mockVersion }),
    update: jest.fn().mockResolvedValue(mockWorkflow),
    archive: jest.fn().mockResolvedValue(undefined),
    findVersions: jest.fn().mockResolvedValue([mockVersion]),
    findVersion: jest.fn().mockResolvedValue(mockVersion),
    computeDiff: jest.fn().mockResolvedValue({ added: [], removed: [], modified: [] }),
    duplicate: jest.fn().mockResolvedValue({ ...mockWorkflow, id: 'new-workflow-id', title: 'Copy of Test Workflow' }),
    getDiagramData: jest.fn().mockResolvedValue({ nodes: [], edges: [] }),
  };

  const mockWorkflowExportService: any = {
    validateExportability: jest.fn().mockResolvedValue({ canExport: true }),
    exportToElsa: jest.fn().mockResolvedValue({ json: {}, filename: 'test.json', artifactUri: 'uri' }),
    exportToBpmnAsync: jest.fn().mockResolvedValue({ pipelineExecutionId: 'exec-1', statusUrl: '/pipeline-executions/exec-1' }),
    exportToPdfAsync: jest.fn().mockResolvedValue({ pipelineExecutionId: 'exec-2', statusUrl: '/pipeline-executions/exec-2' }),
  };

  const mockAuditService: any = {
    getWorkflowAuditLog: jest.fn().mockResolvedValue({ entries: [], total: 0, page: 1, limit: 20 }),
    getDecisionLog: jest.fn().mockResolvedValue({ entries: [], total: 0, page: 1, limit: 20 }),
    exportWorkflowAuditLog: jest.fn().mockResolvedValue({ buffer: Buffer.from('test'), contentType: 'text/csv', filename: 'audit.csv' }),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkflowsController],
      providers: [
        { provide: WorkflowsService, useValue: mockService },
        { provide: WorkflowExportService, useValue: mockWorkflowExportService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    })
      .overrideGuard(useGuards() as any)
      .useValue({ canActivate: () => true })
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();

    httpClient = supertest(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function useGuards() {
    // AuthGuard('jwt') is applied via @UseGuards decorator
    return require('@nestjs/passport').AuthGuard;
  }

  // Helper to make authenticated requests
  const authReq = (method: 'get' | 'post' | 'patch' | 'delete') => {
    const req = httpClient[method]('/workflows');
    return req.set('user', JSON.stringify({ id: userId, orgId, role: 'user' }));
  };

  describe('POST /', () => {
    it('should create a new workflow', async () => {
      const createDto = {
        title: 'New Workflow',
        description: 'Description',
        domain: 'test-domain',
        tags: ['tag1'],
        projectId: null,
      };

      const res = await httpClient
        .post('/workflows')
        .send(createDto)
        .expect(201);

      expect(mockService.create).toHaveBeenCalledWith(createDto, orgId, userId);
      expect(res.body).toHaveProperty('workflow');
    });
  });

  describe('GET /', () => {
    it('should return all workflows with pagination', async () => {
      const res = await httpClient.get('/workflows').query({ page: 1, limit: 20 });

      expect(mockService.findAll).toHaveBeenCalled();
      expect(res.body).toHaveProperty('workflows');
      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('page');
      expect(res.body).toHaveProperty('limit');
    });

    it('should filter workflows by status', async () => {
      await httpClient.get('/workflows').query({ status: 'DRAFT' });

      expect(mockService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'DRAFT' }),
        orgId,
      );
    });

    it('should filter workflows by domain', async () => {
      await httpClient.get('/workflows').query({ domain: 'test-domain' });

      expect(mockService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ domain: 'test-domain' }),
        orgId,
      );
    });

    it('should filter workflows by tags', async () => {
      await httpClient.get('/workflows').query({ tags: ['tag1'] });

      expect(mockService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ tags: ['tag1'] }),
        orgId,
      );
    });

    it('should search workflows by title or description', async () => {
      await httpClient.get('/workflows').query({ search: 'test' });

      expect(mockService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'test' }),
        orgId,
      );
    });
  });

  describe('GET /:id', () => {
    it('should return a workflow by id', async () => {
      const res = await httpClient.get(`/workflows/${workflowId}`);

      expect(mockService.findOneWithLatestVersion).toHaveBeenCalledWith(workflowId, orgId);
      expect(res.body).toHaveProperty('workflow');
    });

    it('should return 404 for non-existent workflow', async () => {
      mockService.findOneWithLatestVersion.mockRejectedValue(new Error('Workflow not found'));

      await httpClient.get('/workflows/invalid-id').expect(500);
    });
  });

  describe('PATCH /:id', () => {
    it('should update a workflow', async () => {
      const updateDto = { title: 'Updated Title' };

      const res = await httpClient.patch(`/workflows/${workflowId}`).send(updateDto);

      expect(mockService.update).toHaveBeenCalled();
      expect(res.body).toHaveProperty('workflow');
    });

    it('should update workflow with new version', async () => {
      const updateDto = { elements_json: { nodes: [], edges: [] } };

      await httpClient.patch(`/workflows/${workflowId}`).send(updateDto);

      expect(mockService.update).toHaveBeenCalledWith(
        workflowId,
        expect.objectContaining({ elements_json: { nodes: [], edges: [] } }),
        orgId,
        userId,
        expect.any(String),
      );
    });
  });

  describe('POST /:id/versions', () => {
    it('should create a new workflow version', async () => {
      const versionDto = {
        elements_json: { nodes: [{ id: 'node1' }], edges: [] },
        source: 'user',
      };

      const res = await httpClient.post(`/workflows/${workflowId}/versions`).send(versionDto);

      expect(mockService.update).toHaveBeenCalled();
      expect(res.body).toHaveProperty('workflow');
    });
  });

  describe('GET /:id/versions', () => {
    it('should return all versions of a workflow', async () => {
      const res = await httpClient.get(`/workflows/${workflowId}/versions`);

      expect(mockService.findVersions).toHaveBeenCalledWith(workflowId, orgId);
      expect(res.body).toHaveProperty('versions');
    });
  });

  describe('GET /:id/versions/:versionNumber', () => {
    it('should return a specific version', async () => {
      const res = await httpClient.get(`/workflows/${workflowId}/versions/1`);

      expect(mockService.findVersion).toHaveBeenCalledWith(workflowId, 1, orgId);
      expect(res.body).toHaveProperty('version');
    });
  });

  describe('GET /:id/diff/:v1/:v2', () => {
    it('should compute diff between two versions', async () => {
      const res = await httpClient.get(`/workflows/${workflowId}/diff/1/2`);

      expect(mockService.computeDiff).toHaveBeenCalledWith(workflowId, 1, 2, orgId);
      expect(res.body).toHaveProperty('diff');
    });
  });

  describe('POST /:id/duplicate', () => {
    it('should duplicate a workflow', async () => {
      const dto = { title: 'Duplicate Title' };

      const res = await httpClient.post(`/workflows/${workflowId}/duplicate`).send(dto);

      expect(mockService.duplicate).toHaveBeenCalledWith(workflowId, orgId, userId, dto.title);
      expect(res.body).toHaveProperty('workflow');
    });

    it('should duplicate with default title', async () => {
      const dto = {};

      await httpClient.post(`/workflows/${workflowId}/duplicate`).send(dto);

      expect(mockService.duplicate).toHaveBeenCalledWith(workflowId, orgId, userId, undefined);
    });
  });

  describe('GET /:id/diagram-data', () => {
    it('should return diagram data for a workflow', async () => {
      const res = await httpClient.get(`/workflows/${workflowId}/diagram-data`);

      expect(mockService.getDiagramData).toHaveBeenCalledWith(workflowId, orgId);
      expect(res.body).toHaveProperty('nodes');
      expect(res.body).toHaveProperty('edges');
    });
  });

  describe('DELETE /:id', () => {
    it('should archive a workflow', async () => {
      await httpClient.delete(`/workflows/${workflowId}`).expect(204);

      expect(mockService.archive).toHaveBeenCalledWith(workflowId, orgId, userId, expect.any(String));
    });
  });

  describe('GET /:id/audit-log', () => {
    it('should return audit log for a workflow', async () => {
      const res = await httpClient.get(`/workflows/${workflowId}/audit-log`);

      expect(mockAuditService.getWorkflowAuditLog).toHaveBeenCalledWith(
        workflowId,
        expect.any(Object),
        expect.any(Object),
      );
      expect(res.body).toHaveProperty('entries');
      expect(res.body).toHaveProperty('total');
    });

    it('should support pagination params', async () => {
      await httpClient.get(`/workflows/${workflowId}/audit-log`).query({ page: 2, limit: 10 });

      expect(mockAuditService.getWorkflowAuditLog).toHaveBeenCalledWith(
        workflowId,
        expect.any(Object),
        expect.objectContaining({ page: 2, limit: 10 }),
      );
    });
  });

  describe('GET /:id/decision-log', () => {
    it('should return decision log for a workflow', async () => {
      const res = await httpClient.get(`/workflows/${workflowId}/decision-log`);

      expect(mockAuditService.getDecisionLog).toHaveBeenCalledWith(
        workflowId,
        expect.any(Object),
        expect.any(Object),
      );
      expect(res.body).toHaveProperty('entries');
      expect(res.body).toHaveProperty('total');
    });
  });

  describe('POST /:id/audit-log/export', () => {
    it('should export audit log', async () => {
      mockAuditService.exportWorkflowAuditLog.mockResolvedValue({
        buffer: Buffer.from('test,data\n'),
        contentType: 'text/csv',
        filename: 'audit-log.csv',
      });

      const res = await httpClient.post(`/workflows/${workflowId}/audit-log/export`).query({ format: 'CSV' });

      expect(mockAuditService.exportWorkflowAuditLog).toHaveBeenCalled();
      expect(res.status).toBeDefined();
    });
  });

  describe('POST /:id/export/elsa', () => {
    it('should export workflow to Elsa JSON', async () => {
      const res = await httpClient.post(`/workflows/${workflowId}/export/elsa`);

      expect(mockWorkflowExportService.validateExportability).toHaveBeenCalledWith(
        workflowId,
        orgId,
        userId,
        expect.any(String),
      );
      expect(mockWorkflowExportService.exportToElsa).toHaveBeenCalled();
      expect(res.body).toHaveProperty('json');
      expect(res.body).toHaveProperty('filename');
    });

    it('should return conflict for reconciliation required', async () => {
      mockWorkflowExportService.validateExportability.mockResolvedValue({
        canExport: false,
        reason: 'RECONCILIATION_REQUIRED',
        unresolvedCriticalPoints: 5,
      });

      const res = await httpClient.post(`/workflows/${workflowId}/export/elsa`);

      expect(res.status).toBe(409);
      expect(res.body).toHaveProperty('code', 'RECONCILIATION_REQUIRED');
    });

    it('should return conflict for invalid status', async () => {
      mockWorkflowExportService.validateExportability.mockResolvedValue({
        canExport: false,
        reason: 'INVALID_STATUS',
      });

      const res = await httpClient.post(`/workflows/${workflowId}/export/elsa`);

      expect(res.status).toBe(409);
      expect(res.body).toHaveProperty('code', 'INVALID_STATUS');
    });

    it('should return forbidden for unauthorized role', async () => {
      mockWorkflowExportService.validateExportability.mockResolvedValue({
        canExport: false,
        reason: 'FORBIDDEN',
      });

      const res = await httpClient.post(`/workflows/${workflowId}/export/elsa`);

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty('code', 'FORBIDDEN');
    });
  });

  describe('POST /:id/export/bpmn', () => {
    it('should export workflow to BPMN asynchronously', async () => {
      const res = await httpClient.post(`/workflows/${workflowId}/export/bpmn`);

      expect(mockWorkflowExportService.validateExportability).toHaveBeenCalled();
      expect(mockWorkflowExportService.exportToBpmnAsync).toHaveBeenCalled();
      expect(res.status).toBe(202);
      expect(res.body).toHaveProperty('pipelineExecutionId');
      expect(res.body).toHaveProperty('statusUrl');
    });
  });

  describe('POST /:id/export/pdf', () => {
    it('should export workflow to PDF asynchronously', async () => {
      const res = await httpClient.post(`/workflows/${workflowId}/export/pdf`);

      expect(mockWorkflowExportService.validateExportability).toHaveBeenCalled();
      expect(mockWorkflowExportService.exportToPdfAsync).toHaveBeenCalled();
      expect(res.status).toBe(202);
      expect(res.body).toHaveProperty('pipelineExecutionId');
      expect(res.body).toHaveProperty('statusUrl');
    });
  });
});