import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SessionRealtimeEventsService {
  private readonly logger = new Logger(SessionRealtimeEventsService.name);

  emitNeedsReconciliation(sessionId: string): void {
    this.logger.log({ sessionId }, 'session.needs_reconciliation event queued for BE-17 gateway');
  }
}
