import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditLog } from '@modules/audit/entities/audit-log.entity';
import { RealtimeModule } from '@modules/realtime/realtime.module';
import { Session } from '@modules/sessions/entities';
import { Workflow } from '@modules/workflows/entities';
import { NatsModule } from '@nats/nats.module';

import { Document } from './entities';
import {
  DocumentsController,
  WorkflowDocumentsController,
} from './controllers';
import {
  DocumentPreprocessSubscriberService,
  DocumentStorageService,
  DocumentsService,
} from './services';

@Module({
  imports: [
    NatsModule,
    RealtimeModule,
    TypeOrmModule.forFeature([Document, Session, Workflow, AuditLog]),
  ],
  controllers: [DocumentsController, WorkflowDocumentsController],
  providers: [
    DocumentsService,
    DocumentStorageService,
    DocumentPreprocessSubscriberService,
  ],
  exports: [DocumentsService],
})
export class DocumentsModule {}
