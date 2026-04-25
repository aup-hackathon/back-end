import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PipelineExecution } from '../agents/entities/pipeline-execution.entity';
import { AuditModule } from '../audit/audit.module';
import { Document } from '../documents/entities/document.entity';
import { Message } from '../messages/entities/message.entity';
import { RealtimeModule } from '../realtime/realtime.module';
import { WorkflowVersion } from '../workflows/entities/workflow-version.entity';
import { Workflow } from '../workflows/entities/workflow.entity';
import { AIGatewayModule } from '../ai-gateway/ai-gateway.module';
import { NatsModule } from '../../infra/nats/nats.module';
import { Session } from './entities/session.entity';
import { SessionOrgGuard } from './session-org.guard';
import { SessionRealtimeEventsService } from './session-realtime-events.service';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

@Module({
  imports: [
    NatsModule,
    AIGatewayModule,
    AuditModule,
    RealtimeModule,
    TypeOrmModule.forFeature([
      Session,
      Workflow,
      WorkflowVersion,
      PipelineExecution,
      Message,
      Document,
    ]),
  ],
  controllers: [SessionsController],
  providers: [SessionsService, SessionOrgGuard, SessionRealtimeEventsService],
  exports: [SessionsService],
})
export class SessionsModule { }
