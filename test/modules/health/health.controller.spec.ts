import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import { HealthController } from '../../../src/modules/health/health.controller';
import { HealthService } from '../../../src/modules/health/health.service';

describe('HealthController', () => {
  let app: INestApplication;
  let httpClient: supertest.SuperTest<supertest.Test>;

  beforeAll(async () => {
    const mockService: any = {
      checkHealth: jest.fn().mockResolvedValue({
        status: 'ok',
        services: { postgres: { status: 'ok', latency_ms: 10 } },
        timestamp: new Date().toISOString(),
      }),
      checkHealthDetails: jest.fn().mockResolvedValue({
        status: 'ok',
        services: {},
        timestamp: new Date().toISOString(),
      }),
      checkAiService: jest.fn().mockResolvedValue({ status: 'ok', latency_ms: 10 }),
      checkOllama: jest.fn().mockResolvedValue({ status: 'ok', latency_ms: 10 }),
      checkPgVector: jest.fn().mockResolvedValue({ status: 'ok', latency_ms: 10 }),
      checkNatsStats: jest.fn().mockResolvedValue({ consumer_count: 0, message_count: 0, bytes: 0 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: mockService }],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    httpClient = supertest(app.getHttpServer()) as any;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/health', () => {
    it('should return health status (public endpoint)', async () => {
      const response = await httpClient.get('/api/health');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
    });
  });

  describe('GET /api/health/ping', () => {
    it('should return pong (public endpoint)', async () => {
      const response = await httpClient.get('/api/health/ping');
      expect(response.status).toBe(200);
      expect(response.body.pong).toBe(true);
    });
  });
});