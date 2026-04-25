import { Injectable, Logger } from '@nestjs/common';

import { RealtimeEmitterService } from '../realtime/services/realtime-emitter.service';
import { SessionNeedsReconciliationPayload } from '../realtime/interfaces/ws-payloads.interface';

@Injectable()
export class SessionRealtimeEventsService {
  private readonly logger = new Logger(SessionRealtimeEventsService.name);

  constructor(private readonly realtimeEmitter: RealtimeEmitterService) {}

  emitNeedsReconciliation(
    sessionId: string,
    reportId: string,
    similarityScore: number,
  ): void {
    this.logger.log({
      sessionId,
      reportId,
      similarityScore,
    }, 'Emitting session.needs_reconciliation');

    const payload: SessionNeedsReconciliationPayload = {
      session_id: sessionId,
      report_id: reportId,
      similarity_score: similarityScore,
    };
    this.realtimeEmitter.emitSessionNeedsReconciliation(sessionId, payload);
  }
}
