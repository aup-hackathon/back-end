import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  CONSUMERS,
  DocumentPreprocessResultEvent,
  SUBJECTS,
} from '../../../core/messaging';
import { NatsClientService } from '../../../infra/nats/nats.client';
import { RealtimeGateway } from '../../realtime/realtime.gateway';

import { Document } from '../entities';

@Injectable()
export class DocumentPreprocessSubscriberService implements OnModuleInit {
  private readonly logger = new Logger(DocumentPreprocessSubscriberService.name);

  constructor(
    @InjectRepository(Document)
    private readonly documentRepository: Repository<Document>,
    private readonly natsClient: NatsClientService,
    private readonly realtimeGateway: RealtimeGateway,
  ) { }

  async onModuleInit(): Promise<void> {
    await this.natsClient.subscribeDurable({
      subject: SUBJECTS.DOCUMENT_PREPROCESS_RESULT,
      durableName: CONSUMERS.DOCUMENT_PREPROCESS_RESULT,
      payloadType: DocumentPreprocessResultEvent,
      handler: async (payload) => {
        await this.handlePreprocessResult(payload as unknown as DocumentPreprocessResultEvent);
      },
    });
  }

  async handlePreprocessResult(payload: DocumentPreprocessResultEvent): Promise<void> {
    const document = await this.documentRepository.findOne({
      where: {
        id: payload.document_id,
      },
    });

    if (!document || document.deletedAt || document.archivedAt) {
      this.logger.warn(`Dropping preprocess result for missing/inactive document ${payload.document_id}`);
      return;
    }

    document.extractedText = payload.extracted_text;
    document.preprocessingConfidence = payload.preprocessing_confidence ?? null;
    await this.documentRepository.save(document);

    if (document.sessionId) {
      this.realtimeGateway.emitToSession(document.sessionId, 'document.ready', {
        type: 'document.ready',
        document_id: document.id,
      });
    }
  }
}
