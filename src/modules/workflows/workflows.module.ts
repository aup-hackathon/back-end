import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CoreModule } from '../../core/core.module';
import { NatsModule } from '../../infra/nats/nats.module';
import { AuditModule } from '../audit/audit.module';
import { Session } from '../sessions/entities';
import { Message } from '../messages/entities';
import { DivergenceReport, DivergencePoint } from '../divergence/entities';
import { PipelineExecution } from '../agents/entities';
import { Workflow, WorkflowVersion } from './entities';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';
import { ElsaMappingService } from './services/elsa-mapping.service';
import { WorkflowExportService } from './services/workflow-export.service';
import { ShareWorkflowController } from './controllers/share-workflow.controller';
import { ShareWorkflowService } from './services/share-workflow.service';

@Module({
  imports: [
    CoreModule,
    NatsModule,
    AuditModule,
    TypeOrmModule.forFeature([
      Workflow,
      WorkflowVersion,
      Session,
      Message,
      DivergenceReport,
      DivergencePoint,
      PipelineExecution,
    ]),
  ],
  controllers: [WorkflowsController, ShareWorkflowController],
  providers: [WorkflowsService, ElsaMappingService, WorkflowExportService, ShareWorkflowService],
  exports: [WorkflowsService, ElsaMappingService, WorkflowExportService, ShareWorkflowService],
})
export class WorkflowsModule { }
