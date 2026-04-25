import { INestApplicationContext, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';

/**
 * Custom Socket.IO adapter that validates JWT on the WebSocket handshake.
 *
 * Token is read from:
 *   1. `socket.handshake.auth.token`
 *   2. `socket.handshake.query.token` (fallback)
 *
 * On success, `socket.data` is populated with `{ userId, orgId, role }`.
 * On failure, the socket is disconnected immediately.
 */
export class WsJwtAuthAdapter extends IoAdapter {
  private readonly logger = new Logger(WsJwtAuthAdapter.name);
  private readonly jwtService: JwtService;
  private readonly jwtSecret: string;
  private readonly devBypassAuth: boolean;

  constructor(app: INestApplicationContext) {
    super(app);
    this.jwtService = app.get(JwtService);
    const configService = app.get(ConfigService);
    this.jwtSecret = configService.getOrThrow<string>('jwt.accessSecret');
    this.devBypassAuth = configService.get<boolean>('devBypassAuth', false);
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, {
      ...options,
      pingInterval: 25_000,
      pingTimeout: 60_000,
    });

    server.use(async (socket: any, next: (err?: Error) => void) => {
      try {
        const token =
          socket.handshake?.auth?.token ||
          socket.handshake?.query?.token;

        // DEV_BYPASS_AUTH mode: attach dev user when no token is provided
        if (this.devBypassAuth && !token) {
          socket.data = {
            userId: '00000000-0000-0000-0000-000000000001',
            orgId: '00000000-0000-0000-0000-00000000a000',
            role: 'admin',
          };
          this.logger.debug(`DEV_BYPASS_AUTH: client ${socket.id} connected as dev user`);
          return next();
        }

        if (!token) {
          this.logger.warn(`WS handshake rejected — no token (ip=${socket.handshake?.address})`);
          return next(new Error('Authentication error: token missing'));
        }

        const payload = await this.jwtService.verifyAsync(token, {
          secret: this.jwtSecret,
        });

        socket.data = {
          userId: payload.sub || payload.id,
          orgId: payload.orgId,
          role: payload.role,
        };

        this.logger.debug(
          `WS authenticated: userId=${socket.data.userId} orgId=${socket.data.orgId} role=${socket.data.role}`,
        );
        return next();
      } catch (error) {
        this.logger.warn(
          `WS handshake rejected — invalid token (ip=${socket.handshake?.address}): ${(error as Error).message}`,
        );
        return next(new Error('Authentication error: invalid token'));
      }
    });

    return server;
  }
}
