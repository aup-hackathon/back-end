import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket): void {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  emitToSession(sessionId: string, event: string, payload: Record<string, unknown>): void {
    this.logger.log(`ws emit session=${sessionId} event=${event} payload=${JSON.stringify(payload)}`);
    // Emit to specific room based on session
    this.server?.to(`session:${sessionId}`).emit(event, payload);
  }

  emitToRoom(room: string, event: string, payload: Record<string, unknown>): void {
    this.logger.log(`ws emit room=${room} event=${event} payload=${JSON.stringify(payload)}`);
    // Emit to specific room (like admin-health)
    this.server?.to(room).emit(event, payload);
  }

  emitBroadcast(event: string, payload: Record<string, unknown>): void {
    this.logger.log(`ws broadcast event=${event} payload=${JSON.stringify(payload)}`);
    this.server?.emit(event, payload);
  }

  @SubscribeMessage('join-room')
  handleJoinRoom(
    @MessageBody() data: { room: string },
    @ConnectedSocket() client: Socket,
  ): void {
    const { room } = data;
    client.join(room);
    this.logger.log(`Client ${client.id} joined room: ${room}`);
  }

  @SubscribeMessage('leave-room')
  handleLeaveRoom(
    @MessageBody() data: { room: string },
    @ConnectedSocket() client: Socket,
  ): void {
    const { room } = data;
    client.leave(room);
    this.logger.log(`Client ${client.id} left room: ${room}`);
  }
}