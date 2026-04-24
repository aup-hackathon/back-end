import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Session } from '@modules/sessions/entities';
import { Workflow } from '@modules/workflows/entities';

import { Document } from './entities';
import {
  DocumentsController,
  WorkflowDocumentsController,
} from './controllers';
import {
  DocumentStorageService,
  DocumentsService,
} from './services';

@Module({
  imports: [TypeOrmModule.forFeature([Document, Session, Workflow])],
  controllers: [DocumentsController, WorkflowDocumentsController],
  providers: [DocumentsService, DocumentStorageService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
