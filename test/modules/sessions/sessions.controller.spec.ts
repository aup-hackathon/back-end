import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import { SessionsController } from '../../../src/modules/sessions/sessions.controller';
import { SessionsService } from '../../../src/modules/sessions/sessions.service';
import { SessionOrgGuard } from '../../../src/modules/sessions/session-org.guard';
import { JwtAuthGuard } from '../../../src/core/guards/jwt-auth.guard';
import { RolesGuard } from '../../../src/core/guards/roles.guard';

const mockJwtGuard = { canActivate: jest.fn().mockReturnValue(true) };
const mockRolesGuard = { canActivate: jest.fn().mockReturnValue(true) };
const mockOrgGuard = { canActivate: jest.fn().mockReturnValue(true) };

describe('SessionsController', () => {
  let app: INestApplication;
  let httpClient: supertest.SuperTest<supertest.Test>;

  beforeAll(async () => {
    const mockService: any = {
      createSession: jest.fn().mockResolvedValue({ id: 'session-1', title: 'Test Session', status: 'CREATED' }),
      getSession: jest.fn().mockResolvedValue({ id: 'session-1', title: 'Test Session', status: 'CREATED' }),
      updateMode: jest.fn().mockResolvedValue({ id: 'session-1', mode: 'AUTO' }),
      finalize: jest.fn().mockResolvedValue({ id: 'session-1', status: 'FINALIZED' }),
      getWorkflowState: jest.fn().mockResolvedValue({ nodes: [], edges: [] }),
      listSessions: jest.fn().mockResolvedValue([
        { id: 'session-1', title: 'Session 1', status: 'CREATED' },
        { id: 'session-2', title: 'Session 2', status: 'IN_PROGRESS' },
      ]),
      startElicitation: jest.fn().mockResolvedValue({ id: 'session-1', status: 'IN_PROGRESS' }),
      confirmActor: jest.fn().mockResolvedValue({ id: 'session-1', status: 'ACTOR_CONFIRMED' }),
      extractNextClaim: jest.fn().mockResolvedValue({ id: 'session-1', status: 'EXTRACTING' }),
      submitClaim: jest.fn().mockResolvedValue({ id: 'session-1', status: 'CLAIM_SUBMITTED' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SessionsController],
      providers: [{ provide: SessionsService, useValue: mockService }],
    })
      .overrideProvider(JwtAuthGuard).useValue(mockJwtGuard)
      .overrideProvider(RolesGuard).useValue(mockRolesGuard)
      .overrideProvider(SessionOrgGuard).useValue(mockOrgGuard)
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    httpClient = supertest(app.getHttpServer()) as any;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/sessions', () => {
    it('should create a new session', async () => {
      const response = await httpClient
        .post('/api/sessions')
        .set('Authorization', 'Bearer mock-token')
        .send({ title: 'Test Session', workflowId: 'wf-1', mode: 'AUTO' });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
    });
  });

  describe('GET /api/sessions', () => {
    it('should return list of sessions', async () => {
      const response = await httpClient
        .get('/api/sessions')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
    });
  });

  describe('GET /api/sessions/:id', () => {
    it('should return a session by id', async () => {
      const response = await httpClient
        .get('/api/sessions/session-1')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(200);
      expect(response.body.id).toBe('session-1');
    });
  });

  describe('PATCH /api/sessions/:id/mode', () => {
    it('should update session mode', async () => {
      const response = await httpClient
        .patch('/api/sessions/session-1/mode')
        .set('Authorization', 'Bearer mock-token')
        .send({ mode: 'AUTO' });

      expect(response.status).toBe(200);
    });
  });

  describe('POST /api/sessions/:id/finalize', () => {
    it('should finalize a session', async () => {
      const response = await httpClient
        .post('/api/sessions/session-1/finalize')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/sessions/:id/workflow-state', () => {
    it('should return workflow state', async () => {
      const response = await httpClient
        .get('/api/sessions/session-1/workflow-state')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(200);
    });
  });

  describe('POST /api/sessions/:id/start-elicitation', () => {
    it('should start elicitation', async () => {
      const response = await httpClient
        .post('/api/sessions/session-1/start-elicitation')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(200);
    });
  });
});