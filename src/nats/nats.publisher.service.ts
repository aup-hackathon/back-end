import { Injectable, Logger } from '@nestjs/common';
import { validateOrReject } from 'class-validator';
import { connect, JSONCodec } from 'nats';

import { SessionFinalizedPayload, SUBJECTS } from './contracts';

@Injectable()
export class NatsPublisherService {
  private readonly logger = new Logger(NatsPublisherService.name);

  async publishSessionFinalized(payload: SessionFinalizedPayload): Promise<void> {
    await validateOrReject(Object.assign(new SessionFinalizedPayload(), payload));

    const servers = process.env.NATS_URL;
    if (!servers) {
      this.logger.warn('NATS_URL is not configured; session finalized event was not published');
      return;
    }

    const connection = await connect({ servers, timeout: 2_000 });
    try {
      const codec = JSONCodec<SessionFinalizedPayload>();
      connection.publish(SUBJECTS.SESSION_FINALIZED, codec.encode(payload));
      await connection.flush();
    } finally {
      await connection.drain();
    }
  }
}
