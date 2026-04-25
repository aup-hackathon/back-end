import { Test, TestingModule } from '@nestjs/testing';
import { Socket, Server } from 'socket.io';

import { RealtimeGateway } from '../realtime.gateway';
import { WsRoomGuardService } from '../services/ws-room-guard.service';
import { WS_ROOMS, WS_CLIENT_EVENTS, WS_ERROR_EVENTS, WS_EVENTS } from '../constants/ws-events.constants';

describe('RealtimeGateway', () => {
  let gateway: RealtimeGateway;
  let roomGuard: jest.Mocked<WsRoomGuardService>;

  const mockServer = {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
    sockets: {
      adapter: {
        rooms: new Map<string, Set<string>>(),
      },
    },
  } as unknown as Server;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RealtimeGateway,
        {
          provide: WsRoomGuardService,
          useValue: {
            canJoin: jest.fn(),
          },
        },
      ],
    }).compile();

    gateway = module.get<RealtimeGateway>(RealtimeGateway);
    roomGuard = module.get(WsRoomGuardService) as jest.Mocked<WsRoomGuardService>;

    // Inject mock server
    (gateway as any).server = mockServer;
  });

  afterEach(() => {
    jest.clearAllMocks();
    (mockServer.sockets.adapter.rooms as Map<string, Set<string>>).clear();
  });

  // ─── Connection ─────────────────────────────────────────────────

  describe('handleConnection', () => {
    it('should auto-join user room on connect', () => {
      const mockSocket = createMockSocket({
        userId: 'user-1',
        orgId: 'org-1',
        role: 'admin',
      });

      gateway.handleConnection(mockSocket);

      expect(mockSocket.join).toHaveBeenCalledWith(WS_ROOMS.user('user-1'));
    });

    it('should not auto-join if userId is missing', () => {
      const mockSocket = createMockSocket({});

      gateway.handleConnection(mockSocket);

      expect(mockSocket.join).not.toHaveBeenCalled();
    });
  });

  // ─── Room Join ──────────────────────────────────────────────────

  describe('handleJoinRoom', () => {
    it('should join room when guard allows', async () => {
      roomGuard.canJoin.mockResolvedValue({ allowed: true });
      const mockSocket = createMockSocket({ userId: 'user-1', orgId: 'org-1', role: 'viewer' });

      await gateway.handleJoinRoom({ room: 'session:abc' }, mockSocket);

      expect(mockSocket.join).toHaveBeenCalledWith('session:abc');
      expect(mockSocket.emit).not.toHaveBeenCalledWith(
        WS_ERROR_EVENTS.JOIN_ERROR,
        expect.anything(),
      );
    });

    it('should emit join_error when guard rejects', async () => {
      roomGuard.canJoin.mockResolvedValue({
        allowed: false,
        reason: 'Session not found',
      });
      const mockSocket = createMockSocket({ userId: 'user-1', orgId: 'org-1', role: 'viewer' });

      await gateway.handleJoinRoom({ room: 'session:abc' }, mockSocket);

      expect(mockSocket.join).not.toHaveBeenCalledWith('session:abc');
      expect(mockSocket.emit).toHaveBeenCalledWith(WS_ERROR_EVENTS.JOIN_ERROR, {
        room: 'session:abc',
        reason: 'Session not found',
      });
    });

    it('should disconnect client for cross-org session join attempt', async () => {
      roomGuard.canJoin.mockResolvedValue({
        allowed: false,
        reason: 'Session does not belong to your organization',
      });
      const mockSocket = createMockSocket({ userId: 'user-1', orgId: 'org-a', role: 'viewer' });

      await gateway.handleJoinRoom({ room: 'session:abc' }, mockSocket);

      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    });

    it('should disconnect client for admin-health join without admin role', async () => {
      roomGuard.canJoin.mockResolvedValue({
        allowed: false,
        reason: 'Admin role required',
      });
      const mockSocket = createMockSocket({ userId: 'user-1', orgId: 'org-a', role: 'viewer' });

      await gateway.handleJoinRoom({ room: 'admin-health' }, mockSocket);

      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    });
  });

  // ─── Room Leave ─────────────────────────────────────────────────

  describe('handleLeaveRoom', () => {
    it('should leave room unconditionally', () => {
      const mockSocket = createMockSocket({ userId: 'user-1', orgId: 'org-1', role: 'viewer' });

      gateway.handleLeaveRoom({ room: 'session:abc' }, mockSocket);

      expect(mockSocket.leave).toHaveBeenCalledWith('session:abc');
    });
  });

  // ─── Emit Methods ──────────────────────────────────────────────

  describe('emitToSession', () => {
    it('should emit to session room', () => {
      gateway.emitToSession('session-1', WS_EVENTS.SESSION_STATE, { status: 'processing' });

      expect(mockServer.to).toHaveBeenCalledWith('session:session-1');
      expect(mockServer.emit).toHaveBeenCalledWith(WS_EVENTS.SESSION_STATE, {
        status: 'processing',
      });
    });
  });

  describe('emitToWorkflow', () => {
    it('should emit to workflow room', () => {
      gateway.emitToWorkflow('wf-1', WS_EVENTS.WORKFLOW_UPDATED, { version_number: 2 });

      expect(mockServer.to).toHaveBeenCalledWith('workflow:wf-1');
    });
  });

  describe('emitToPipeline', () => {
    it('should emit to pipeline room', () => {
      gateway.emitToPipeline('pipe-1', WS_EVENTS.PIPELINE_PROGRESS, { progress_pct: 50 });

      expect(mockServer.to).toHaveBeenCalledWith('pipeline:pipe-1');
    });
  });

  describe('emitToUser', () => {
    it('should emit to user room', () => {
      gateway.emitToUser('user-1', WS_EVENTS.NOTIFICATION_REVIEW_REQUEST, {
        comment_id: 'c1',
      });

      expect(mockServer.to).toHaveBeenCalledWith('user:user-1');
    });
  });

  describe('emitToAdminHealth', () => {
    it('should emit to admin-health room', () => {
      gateway.emitToAdminHealth(WS_EVENTS.SYSTEM_HEALTH_ALERT, {
        component: 'nats',
        status: 'down',
      });

      expect(mockServer.to).toHaveBeenCalledWith('admin-health');
    });
  });

  // ─── hasListeners ──────────────────────────────────────────────

  describe('hasListeners', () => {
    it('should return true when room has sockets', () => {
      const rooms = mockServer.sockets.adapter.rooms as Map<string, Set<string>>;
      rooms.set('session:abc', new Set(['socket-1']));

      expect(gateway.hasListeners('session:abc')).toBe(true);
    });

    it('should return false when room is empty', () => {
      expect(gateway.hasListeners('session:xyz')).toBe(false);
    });

    it('should return false when server is not initialized', () => {
      (gateway as any).server = null;
      expect(gateway.hasListeners('session:abc')).toBe(false);
    });
  });
});

// ─── Helpers ────────────────────────────────────────────────────

function createMockSocket(data: Record<string, unknown>): Socket {
  return {
    id: `socket-${Math.random().toString(36).slice(2, 8)}`,
    data,
    join: jest.fn(),
    leave: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
    handshake: { address: '127.0.0.1' },
  } as unknown as Socket;
}
