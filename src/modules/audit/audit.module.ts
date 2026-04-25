import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Workflow } from '../workflows/entities/workflow.entity';
import { AuditLog } from './entities/audit-log.entity';
import { AuditService } from './audit.service';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog, Workflow])],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}

