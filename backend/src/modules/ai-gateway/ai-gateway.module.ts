import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CoreModule } from '../../core/core.module';
import { NatsModule } from '../../nats/nats.module';
import { AgentExecution, AgentLog, PipelineExecution } from '../agents/entities';
import { AuditLog } from '../audit/entities';
import { DivergenceReport, WorkflowGraphSnapshot } from '../divergence/entities';
import { Message } from '../messages/entities';
import { RealtimeModule } from '../realtime/realtime.module';
import { Rule } from '../rules/entities/rule.entity';
import { Session } from '../sessions/entities/session.entity';
import { Skill } from '../skills/entities/skill.entity';
import { KGEdge, KGNode, Workflow, WorkflowVersion } from '../workflows/entities';
import { AIGatewayService } from './ai-gateway.service';
import { AIGatewaySubscriberService } from './ai-gateway.subscriber.service';

@Module({
  imports: [
    CoreModule,
    NatsModule,
    RealtimeModule,
    TypeOrmModule.forFeature([
      Session,
      Workflow,
      WorkflowVersion,
      PipelineExecution,
      AgentExecution,
      AgentLog,
      Message,
      AuditLog,
      WorkflowGraphSnapshot,
      DivergenceReport,
      KGNode,
      KGEdge,
      Rule,
      Skill,
    ]),
  ],
  providers: [AIGatewayService, AIGatewaySubscriberService],
  exports: [AIGatewayService, AIGatewaySubscriberService],
})
export class AIGatewayModule {}
