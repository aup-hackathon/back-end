import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';

import { DeadLetter } from '../modules/agents/entities';
import { SUBJECTS } from './contracts';
import { NatsClientService } from './nats.client';

type DeadLetterPayload = {
  reason: string;
  originalSubject: string;
  payload: Record<string, unknown>;
  deliveryCount: number;
  lastError: string;
};

@Injectable()
export class DlqService {
  private readonly logger = new Logger(DlqService.name);

  constructor(
    private readonly natsClient: NatsClientService,
    @InjectRepository(DeadLetter)
    private readonly deadLetterRepository: Repository<DeadLetter>,
  ) {}

  async moveToDlq(params: {
    subject: string;
    payload: Record<string, unknown>;
    reason: string;
    deliveryCount: number;
    lastError?: string;
    msgId?: string | null;
  }): Promise<void> {
    const deadLetterSubject = `${SUBJECTS.DEAD_LETTER_PREFIX}${params.subject}`;
    const message: DeadLetterPayload = {
      reason: params.reason,
      originalSubject: params.subject,
      payload: params.payload,
      deliveryCount: params.deliveryCount,
      lastError: params.lastError ?? 'unknown error',
    };

    const idempotencyKey = `${params.msgId ?? randomUUID()}:${deadLetterSubject}`;
    await this.natsClient.publish(deadLetterSubject, message, idempotencyKey);

    await this.deadLetterRepository.insert({
      subject: params.subject,
      payload: params.payload,
      reason: params.reason,
      deliveryCount: params.deliveryCount,
      lastError: params.lastError ?? null,
    });

    this.logger.error(
      `Message moved to DLQ subject=${params.subject} deliveryCount=${params.deliveryCount}`,
    );
  }
}
