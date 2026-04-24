import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { DeadLetter } from '../../agents/entities';

export interface DlqRecordParams {
  subject: string;
  payload: Record<string, unknown>;
  reason: string;
  deliveryCount: number;
  lastError?: string;
  msgId?: string | null;
}

@Injectable()
export class AiTaskDlqService {
  private readonly logger = new Logger(AiTaskDlqService.name);

  constructor(
    @InjectRepository(DeadLetter)
    private readonly deadLetterRepository: Repository<DeadLetter>,
  ) {}

  async recordFailure(params: DlqRecordParams): Promise<void> {
    await this.deadLetterRepository.insert({
      subject: params.subject,
      payload: params.payload,
      reason: params.reason,
      deliveryCount: params.deliveryCount,
      lastError: params.lastError ?? null,
    });

    this.logger.error(
      `DLQ recorded: subject=${params.subject} deliveryCount=${params.deliveryCount} reason=${params.reason}`,
    );
  }
}