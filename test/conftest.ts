import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import * as supertest from 'supertest';

// Mock Guards
export const mockJwtGuard = {
  canActivate: jest.fn().mockReturnValue(true),
};

export const mockRolesGuard = {
  canActivate: jest.fn().mockReturnValue(true),
};

// Mock any function - escapes TypeScript checking
export const mockFn = (..._args: any[]) => undefined as any;

// Create a mock service with all possible methods
export function createMockService(methods: Record<string, any> = {}) {
  const mock: any = {};
  for (const [key, value] of Object.entries(methods)) {
    mock[key] = jest.fn().mockResolvedValue(value);
  }
  return mock;
}

// Create a mock repository
export function createMockRepo(defaults: any = {}) {
  return {
    create: jest.fn((data: any) => ({ id: 'mock-id', ...defaults, ...data })),
    save: jest.fn(async (data: any) => ({
      id: 'mock-id',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...defaults,
      ...data,
    })),
    find: jest.fn(async () => []),
    findOne: jest.fn(async () => null),
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getOne: jest.fn().mockResolvedValue(null),
    })),
    delete: jest.fn(async () => ({ affected: 1 })),
    update: jest.fn(async () => ({ affected: 1 })),
    count: jest.fn(async () => 0),
  };
}

// NATS Mock
export const mockNats = {
  connect: jest.fn().mockResolvedValue(undefined),
  subscribe: jest.fn().mockReturnValue({ unsubscribe: jest.fn() }),
  publish: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),
  drain: jest.fn().mockResolvedValue(undefined),
};

// Test fixtures
export const testFixtures = {
  skill: {
    name: 'Test Skill',
    description: 'A test skill',
    type: 'prompt',
    content: 'You are a helpful assistant.',
    isActive: true,
  },
  document: {
    originalName: 'test.pdf',
    mimeType: 'application/pdf',
    size: 1024,
    url: 'http://storage/test.pdf',
  },
  session: {
    title: 'Test Session',
    description: 'A test session',
    mode: 'AUTO',
    status: 'CREATED',
  },
  rule: {
    name: 'Test Rule',
    type: 'ACTOR_MAPPING',
    scope: 'ORG',
    instruction: 'Map boss to Director',
    isActive: true,
  },
  workflow: {
    name: 'Test Workflow',
    description: 'A test workflow',
    status: 'DRAFT',
  },
  message: {
    content: 'Test message',
    type: 'USER',
  },
  organization: {
    name: 'Test Org',
    slug: 'test-org',
  },
  comment: {
    content: 'Test comment',
  },
};