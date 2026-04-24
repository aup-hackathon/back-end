import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CoreModule } from '../../core/core.module';
import { NatsModule } from '../../infra/nats/nats.module';
import { AuditLog } from '../audit/entities';
import { Workflow, WorkflowVersion } from './entities';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';

@Module({
  imports: [
    CoreModule,
    NatsModule,
    TypeOrmModule.forFeature([Workflow, WorkflowVersion, AuditLog]),
  ],
  controllers: [WorkflowsController],
  providers: [WorkflowsService],
  exports: [WorkflowsService],
})
export class WorkflowsModule { }