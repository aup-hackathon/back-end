import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class RealtimeGateway {
  private readonly logger = new Logger(RealtimeGateway.name);

  emitToSession(sessionId: string, event: string, payload: Record<string, unknown>): void {
    this.logger.log(`ws emit session=${sessionId} event=${event} payload=${JSON.stringify(payload)}`);
  }
}
