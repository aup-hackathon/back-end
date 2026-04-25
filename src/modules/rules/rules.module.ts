import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AgentExecution, PipelineExecution } from '../agents/entities';
import { AuditModule } from '../audit/audit.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { Session } from '../sessions/entities';
import { Workflow } from '../workflows/entities';
import { RuleApplication, RuleVersion, Rule } from './entities';
import { RulesController } from './rules.controller';
import { RulesService } from './rules.service';

@Module({
  imports: [
    AuditModule,
    RealtimeModule,
    TypeOrmModule.forFeature([
      Rule,
      RuleVersion,
      RuleApplication,
      Session,
      Workflow,
      AgentExecution,
      PipelineExecution,
    ]),
  ],
  controllers: [RulesController],
  providers: [RulesService],
  exports: [RulesService],
})
export class RulesModule {}
