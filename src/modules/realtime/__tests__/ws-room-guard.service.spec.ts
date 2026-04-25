import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Socket } from 'socket.io';

import { WsRoomGuardService } from '../services/ws-room-guard.service';
import { Session } from '../../sessions/entities/session.entity';
import { Workflow } from '../../workflows/entities/workflow.entity';
import { PipelineExecution } from '../../agents/entities/pipeline-execution.entity';

function mockSocket(data: Record<string, unknown>): Socket {
  return { id: 'test-socket', data } as unknown as Socket;
}

describe('WsRoomGuardService', () => {
  let guard: WsRoomGuardService;
  let sessionsRepo: { findOne: jest.Mock };
  let workflowsRepo: { findOne: jest.Mock };
  let pipelineRepo: { findOne: jest.Mock };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WsRoomGuardService,
        { provide: getRepositoryToken(Session), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(Workflow), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(PipelineExecution), useValue: { findOne: jest.fn() } },
      ],
    }).compile();

    guard = module.get(WsRoomGuardService);
    sessionsRepo = module.get(getRepositoryToken(Session));
    workflowsRepo = module.get(getRepositoryToken(Workflow));
    pipelineRepo = module.get(getRepositoryToken(PipelineExecution));
  });

  afterEach(() => jest.clearAllMocks());

  // ── user room ──
  it('should allow joining own user room', async () => {
    const result = await guard.canJoin(mockSocket({ userId: 'u1', orgId: 'o1', role: 'viewer' }), 'user:u1');
    expect(result.allowed).toBe(true);
  });

  it('should reject joining another user room', async () => {
    const result = await guard.canJoin(mockSocket({ userId: 'u1', orgId: 'o1', role: 'viewer' }), 'user:u2');
    expect(result.allowed).toBe(false);
  });

  // ── session room ──
  it('should allow session room when org matches', async () => {
    sessionsRepo.findOne.mockResolvedValue({ id: 's1', workflowId: 'w1' });
    workflowsRepo.findOne.mockResolvedValue({ id: 'w1' });
    const result = await guard.canJoin(mockSocket({ userId: 'u1', orgId: 'o1', role: 'viewer' }), 'session:s1');
    expect(result.allowed).toBe(true);
  });

  it('should reject session room for cross-org', async () => {
    sessionsRepo.findOne.mockResolvedValue({ id: 's1', workflowId: 'w1' });
    workflowsRepo.findOne.mockResolvedValue(null); // org mismatch
    const result = await guard.canJoin(mockSocket({ userId: 'u1', orgId: 'org-b', role: 'viewer' }), 'session:s1');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('organization');
  });

  it('should reject session room when session not found', async () => {
    sessionsRepo.findOne.mockResolvedValue(null);
    const result = await guard.canJoin(mockSocket({ userId: 'u1', orgId: 'o1', role: 'viewer' }), 'session:bad');
    expect(result.allowed).toBe(false);
  });

  // ── workflow room ──
  it('should allow workflow room when org matches', async () => {
    workflowsRepo.findOne.mockResolvedValue({ id: 'w1' });
    const result = await guard.canJoin(mockSocket({ userId: 'u1', orgId: 'o1', role: 'viewer' }), 'workflow:w1');
    expect(result.allowed).toBe(true);
  });

  it('should reject workflow room for cross-org', async () => {
    workflowsRepo.findOne.mockResolvedValue(null);
    const result = await guard.canJoin(mockSocket({ userId: 'u1', orgId: 'org-b', role: 'viewer' }), 'workflow:w1');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('organization');
  });

  // ── pipeline room ──
  it('should allow pipeline room when linked session is in org', async () => {
    pipelineRepo.findOne.mockResolvedValue({ id: 'p1', sessionId: 's1' });
    sessionsRepo.findOne.mockResolvedValue({ id: 's1', workflowId: 'w1' });
    workflowsRepo.findOne.mockResolvedValue({ id: 'w1' });
    const result = await guard.canJoin(mockSocket({ userId: 'u1', orgId: 'o1', role: 'viewer' }), 'pipeline:p1');
    expect(result.allowed).toBe(true);
  });

  it('should reject pipeline room for cross-org', async () => {
    pipelineRepo.findOne.mockResolvedValue({ id: 'p1', sessionId: 's1' });
    sessionsRepo.findOne.mockResolvedValue({ id: 's1', workflowId: 'w1' });
    workflowsRepo.findOne.mockResolvedValue(null);
    const result = await guard.canJoin(mockSocket({ userId: 'u1', orgId: 'org-b', role: 'viewer' }), 'pipeline:p1');
    expect(result.allowed).toBe(false);
  });

  // ── admin-health ──
  it('should allow admin-health for admin role', async () => {
    const result = await guard.canJoin(mockSocket({ userId: 'u1', orgId: 'o1', role: 'admin' }), 'admin-health');
    expect(result.allowed).toBe(true);
  });

  it('should reject admin-health for non-admin', async () => {
    const result = await guard.canJoin(mockSocket({ userId: 'u1', orgId: 'o1', role: 'viewer' }), 'admin-health');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Admin role required');
  });

  // ── unknown room ──
  it('should reject unknown room pattern', async () => {
    const result = await guard.canJoin(mockSocket({ userId: 'u1', orgId: 'o1', role: 'admin' }), 'unknown:123');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Unknown room pattern');
  });

  // ── missing context ──
  it('should reject when user context is missing', async () => {
    const result = await guard.canJoin(mockSocket({}), 'session:s1');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Missing user context');
  });
});
