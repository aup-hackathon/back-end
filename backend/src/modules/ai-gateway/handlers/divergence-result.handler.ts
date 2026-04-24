import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { SessionStatus } from '../../../database/enums';
import { DivergenceReport } from '../../divergence/entities';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { Session } from '../../sessions/entities';
import { PipelineDivergenceResultEvent } from '../../../core/messaging/events';

export interface DivergenceResultHandlerDeps {
  divergenceReportRepository: Repository<DivergenceReport>;
  sessionsRepository: Repository<Session>;
  realtimeGateway: RealtimeGateway;
  configService: ConfigService;
}

@Injectable()
export class DivergenceResultHandler {
  private readonly handledIds = new Set<string>();

  constructor(private readonly deps: DivergenceResultHandlerDeps) {}

  async handle(payload: PipelineDivergenceResultEvent, msgId?: string | null): Promise<void> {
    const idempotencyKey = this.idempotencyKey(msgId, payload.correlation_id, 'ai.tasks.divergence.result');
    if (this.isAlreadyHandled(idempotencyKey)) return;

    const { divergenceReportRepository, sessionsRepository, realtimeGateway, configService } = this.deps;

    const report = await divergenceReportRepository.findOne({ where: { id: payload.report_id } });
    if (!report) throw new Error('Divergence report not found');

    const threshold = configService.get<number>('divergence.threshold', 0.7);
    report.overallSimilarity = payload.similarity_score;
    await divergenceReportRepository.save(report);

    if (payload.similarity_score < threshold) {
      const session = await sessionsRepository.findOne({ where: { id: payload.session_id } });
      if (session) {
        session.status = SessionStatus.NEEDS_RECONCILIATION;
        await sessionsRepository.save(session);
        realtimeGateway.emitToSession(session.id, 'session.needs_reconciliation', {
          similarityScore: payload.similarity_score,
          threshold,
        });
      }
    }

    this.markHandled(idempotencyKey);
  }

  private idempotencyKey(msgId: string | null | undefined, correlationId: string, subject: string): string {
    return `${msgId ?? ''}:${correlationId}:${subject}`;
  }

  private isAlreadyHandled(key: string): boolean {
    return this.handledIds.has(key);
  }

  private markHandled(key: string): void {
    this.handledIds.add(key);
    if (this.handledIds.size > 10_000) {
      const first = this.handledIds.values().next().value;
      if (first) this.handledIds.delete(first);
    }
  }
}