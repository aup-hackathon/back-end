import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditModule } from '../audit/audit.module';
import { CoreModule } from '../../core/core.module';
import { Skill, SkillApplication } from './entities';
import { SkillsController, AdminSkillsController, AgentExecutionsSkillsController } from './controllers';
import { SkillsService } from './services/skills.service';

@Module({
  imports: [
    CoreModule,
    AuditModule,
    TypeOrmModule.forFeature([Skill, SkillApplication]),
  ],
  controllers: [SkillsController, AdminSkillsController, AgentExecutionsSkillsController],
  providers: [SkillsService],
  exports: [SkillsService],
})
export class SkillsModule {}
