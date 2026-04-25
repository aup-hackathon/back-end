import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import { RulesController } from '../../../src/modules/rules/rules.controller';
import { RulesService } from '../../../src/modules/rules/rules.service';
import { JwtAuthGuard } from '../../../src/core/guards/jwt-auth.guard';
import { RolesGuard } from '../../../src/core/guards/roles.guard';

const mockJwtGuard = { canActivate: jest.fn().mockReturnValue(true) };
const mockRolesGuard = { canActivate: jest.fn().mockReturnValue(true) };

describe('RulesController', () => {
  let app: INestApplication;
  let httpClient: supertest.SuperTest<supertest.Test>;

  beforeAll(async () => {
    const mockService: any = {
      create: jest.fn().mockResolvedValue({ id: 'rule-1', name: 'Test Rule', isActive: true }),
      findAll: jest.fn().mockResolvedValue([
        { id: 'rule-1', name: 'Rule 1', isActive: true },
        { id: 'rule-2', name: 'Rule 2', isActive: true },
      ]),
      findOne: jest.fn().mockResolvedValue({ id: 'rule-1', name: 'Test Rule' }),
      update: jest.fn().mockResolvedValue({ id: 'rule-1', instruction: 'Updated' }),
      activate: jest.fn().mockResolvedValue({ id: 'rule-1', isActive: true }),
      deactivate: jest.fn().mockResolvedValue({ id: 'rule-1', isActive: false }),
      testRule: jest.fn().mockResolvedValue({
        with_rule_output: { extracted_actor: 'Director' },
        without_rule_output: { extracted_actor: 'Boss' },
        diff_summary: 'Changed',
      }),
      exportRules: jest.fn().mockResolvedValue({ rules: [] }),
      importRules: jest.fn().mockResolvedValue({ imported: 0 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RulesController],
      providers: [{ provide: RulesService, useValue: mockService }],
    })
      .overrideProvider(JwtAuthGuard).useValue(mockJwtGuard)
      .overrideProvider(RolesGuard).useValue(mockRolesGuard)
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    httpClient = supertest(app.getHttpServer()) as any;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/rules', () => {
    it('should create a new rule', async () => {
      const response = await httpClient
        .post('/api/rules')
        .set('Authorization', 'Bearer mock-token')
        .send({ name: 'Test Rule', type: 'ACTOR_MAPPING', instruction: 'Map boss to Director' });

      expect(response.status).toBe(201);
    });
  });

  describe('GET /api/rules', () => {
    it('should return list of rules', async () => {
      const response = await httpClient
        .get('/api/rules')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/rules/:id', () => {
    it('should return a rule by id', async () => {
      const response = await httpClient
        .get('/api/rules/rule-1')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(200);
    });
  });

  describe('PATCH /api/rules/:id', () => {
    it('should update a rule', async () => {
      const response = await httpClient
        .patch('/api/rules/rule-1')
        .set('Authorization', 'Bearer mock-token')
        .send({ instruction: 'Updated instruction' });

      expect(response.status).toBe(200);
    });
  });

  describe('POST /api/rules/:id/activate', () => {
    it('should activate a rule', async () => {
      const response = await httpClient
        .post('/api/rules/rule-1/activate')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(200);
    });
  });

  describe('POST /api/rules/:id/deactivate', () => {
    it('should deactivate a rule', async () => {
      const response = await httpClient
        .post('/api/rules/rule-1/deactivate')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/rules/export', () => {
    it('should export rules', async () => {
      const response = await httpClient
        .get('/api/rules/export')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(200);
    });
  });

  describe('POST /api/rules/import', () => {
    it('should import rules', async () => {
      const response = await httpClient
        .post('/api/rules/import')
        .set('Authorization', 'Bearer mock-token')
        .send({ rules: [] });

      expect(response.status).toBe(201);
    });
  });
});