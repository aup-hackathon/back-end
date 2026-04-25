import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import { SkillsController } from '../../../src/modules/skills/skills.controller';
import { SkillsService } from '../../../src/modules/skills/services/skills.service';
import { JwtAuthGuard } from '../../../src/core/guards/jwt-auth.guard';
import { RolesGuard } from '../../../src/core/guards/roles.guard';

const mockJwtGuard = { canActivate: jest.fn().mockReturnValue(true) };
const mockRolesGuard = { canActivate: jest.fn().mockReturnValue(true) };

describe('SkillsController', () => {
  let app: INestApplication;
  let httpClient: supertest.SuperTest<supertest.Test>;

  beforeAll(async () => {
    const mockService: any = {
      create: jest.fn().mockResolvedValue({ id: 'skill-1', name: 'Test Skill', isActive: true }),
      findAll: jest.fn().mockResolvedValue([
        { id: 'skill-1', name: 'Skill 1', type: 'prompt', isActive: true },
        { id: 'skill-2', name: 'Skill 2', type: 'tool', isActive: true },
      ]),
      findOne: jest.fn().mockResolvedValue({ id: 'skill-1', name: 'Test Skill', type: 'prompt', isActive: true }),
      update: jest.fn().mockResolvedValue({ id: 'skill-1', name: 'Updated Skill Name' }),
      remove: jest.fn().mockResolvedValue(undefined),
      semanticSearch: jest.fn().mockResolvedValue([{ id: 'skill-1', name: 'Skill 1', score: 0.95 }]),
      importSkills: jest.fn().mockResolvedValue([
        { id: 'skill-1', name: 'Skill 1' },
        { id: 'skill-2', name: 'Skill 2' },
      ]),
      exportSkills: jest.fn().mockResolvedValue([{ id: 'skill-1', name: 'Skill 1', isActive: true }]),
      findApplications: jest.fn().mockResolvedValue({ data: [{ id: 'app-1' }], total: 1, page: 1, limit: 20 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SkillsController],
      providers: [{ provide: SkillsService, useValue: mockService }],
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

  describe('POST /api/skills', () => {
    it('should create a new skill', async () => {
      const response = await httpClient
        .post('/api/skills')
        .set('Authorization', 'Bearer mock-token')
        .send({ name: 'Test Skill', type: 'prompt', content: 'Content' });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
    });
  });

  describe('GET /api/skills', () => {
    it('should return list of skills', async () => {
      const response = await httpClient
        .get('/api/skills')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
    });

    it('should filter by type', async () => {
      const response = await httpClient
        .get('/api/skills?type=prompt')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/skills/:id', () => {
    it('should return a skill by id', async () => {
      const response = await httpClient
        .get('/api/skills/skill-1')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(200);
      expect(response.body.id).toBe('skill-1');
    });
  });

  describe('PATCH /api/skills/:id', () => {
    it('should update a skill', async () => {
      const response = await httpClient
        .patch('/api/skills/skill-1')
        .set('Authorization', 'Bearer mock-token')
        .send({ name: 'Updated Skill Name' });

      expect(response.status).toBe(200);
    });
  });

  describe('DELETE /api/skills/:id', () => {
    it('should soft delete a skill', async () => {
      const response = await httpClient
        .delete('/api/skills/skill-1')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(204);
    });
  });

  describe('POST /api/skills/search', () => {
    it('should perform semantic search', async () => {
      const response = await httpClient
        .post('/api/skills/search')
        .set('Authorization', 'Bearer mock-token')
        .send({ query: 'helpful assistant' });

      expect(response.status).toBe(200);
    });
  });

  describe('POST /api/skills/import', () => {
    it('should import skills in batch', async () => {
      const response = await httpClient
        .post('/api/skills/import')
        .set('Authorization', 'Bearer mock-token')
        .send({ skills: [{ name: 'Skill 1', type: 'prompt' }] });

      expect(response.status).toBe(201);
    });
  });

  describe('GET /api/skills/export', () => {
    it('should export all active skills', async () => {
      const response = await httpClient
        .get('/api/skills/export')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/skills/:id/applications', () => {
    it('should return skill application history', async () => {
      const response = await httpClient
        .get('/api/skills/skill-1/applications')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(200);
    });
  });
});