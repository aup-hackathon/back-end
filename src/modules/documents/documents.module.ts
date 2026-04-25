import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditModule } from '@modules/audit/audit.module';
import { RealtimeModule } from '@modules/realtime/realtime.module';
import { Session } from '@modules/sessions/entities';
import { Workflow } from '@modules/workflows/entities';
import { NatsModule } from '../../infra/nats/nats.module';

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
    AuditModule,
    TypeOrmModule.forFeature([Document, Session, Workflow]),
  ],
  controllers: [DocumentsController, WorkflowDocumentsController],
  providers: [
    DocumentsService,
    DocumentStorageService,
    DocumentPreprocessSubscriberService,
  ],
  exports: [DocumentsService],
})
export class DocumentsModule { }
