import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

import { WsRoomGuardService } from './services/ws-room-guard.service';
import { WS_CLIENT_EVENTS, WS_ERROR_EVENTS, WS_ROOMS } from './constants/ws-events.constants';
import { JoinRoomPayload, JoinErrorPayload } from './interfaces/ws-payloads.interface';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(private readonly roomGuard: WsRoomGuardService) {}

  // ─── Lifecycle ────────────────────────────────────────────────────

  afterInit(): void {
    this.logger.log('WebSocket gateway initialized');
  }

  handleConnection(client: Socket): void {
    const { userId, orgId, role } = client.data || {};
    this.logger.log(
      `Client connected: id=${client.id} userId=${userId} orgId=${orgId} role=${role}`,
    );

    // Auto-join the user's personal room
    if (userId) {
      const userRoom = WS_ROOMS.user(userId);
      client.join(userRoom);
      this.logger.debug(`Client ${client.id} auto-joined room: ${userRoom}`);
    }
  }

  handleDisconnect(client: Socket): void {
    const { userId } = client.data || {};
    this.logger.log(`Client disconnected: id=${client.id} userId=${userId}`);
    // Socket.IO automatically removes the client from all rooms on disconnect
  }

  // ─── Client → Server Events ──────────────────────────────────────

  @SubscribeMessage(WS_CLIENT_EVENTS.JOIN_ROOM)
  async handleJoinRoom(
    @MessageBody() data: JoinRoomPayload,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const { room } = data;

    const result = await this.roomGuard.canJoin(client, room);

    if (!result.allowed) {
      const errorPayload: JoinErrorPayload = {
        room,
        reason: result.reason || 'Unauthorized',
      };
      client.emit(WS_ERROR_EVENTS.JOIN_ERROR, errorPayload);

      // Disconnect for cross-org violations and admin-health unauthorized access
      if (
        result.reason?.includes('does not belong to your organization') ||
        result.reason?.includes('not in your organization') ||
        result.reason === 'Admin role required'
      ) {
        this.logger.warn(
          `Disconnecting client ${client.id} after unauthorized room join attempt: ${room}`,
        );
        client.disconnect(true);
      }
      return;
    }

    client.join(room);
    this.logger.log(`Client ${client.id} joined room: ${room}`);
  }

  @SubscribeMessage(WS_CLIENT_EVENTS.LEAVE_ROOM)
  handleLeaveRoom(
    @MessageBody() data: JoinRoomPayload,
    @ConnectedSocket() client: Socket,
  ): void {
    const { room } = data;
    client.leave(room);
    this.logger.log(`Client ${client.id} left room: ${room}`);
  }

  // ─── Server → Client Emitters (used by bridge & emitter service) ──

  emitToSession(sessionId: string, event: string, payload: Record<string, unknown>): void {
    const room = WS_ROOMS.session(sessionId);
    this.server?.to(room).emit(event, payload);
  }

  emitToWorkflow(workflowId: string, event: string, payload: Record<string, unknown>): void {
    const room = WS_ROOMS.workflow(workflowId);
    this.server?.to(room).emit(event, payload);
  }

  emitToPipeline(
    pipelineExecutionId: string,
    event: string,
    payload: Record<string, unknown>,
  ): void {
    const room = WS_ROOMS.pipeline(pipelineExecutionId);
    this.server?.to(room).emit(event, payload);
  }

  emitToUser(userId: string, event: string, payload: Record<string, unknown>): void {
    const room = WS_ROOMS.user(userId);
    this.server?.to(room).emit(event, payload);
  }

  emitToAdminHealth(event: string, payload: Record<string, unknown>): void {
    this.server?.to(WS_ROOMS.adminHealth).emit(event, payload);
  }

  /**
   * Generic room emitter — backward-compatible escape hatch for modules
   * that need to emit to arbitrary room names (e.g. health, rules).
   */
  emitToRoom(room: string, event: string, payload: Record<string, unknown>): void {
    this.server?.to(room).emit(event, payload);
  }

  /**
   * Check whether a room currently has any connected sockets.
   * Used by the NATS bridge for backpressure — messages for empty rooms are dropped.
   */
  hasListeners(room: string): boolean {
    if (!this.server) return false;
    const roomSockets = this.server.sockets.adapter.rooms.get(room);
    return !!roomSockets && roomSockets.size > 0;
  }
}