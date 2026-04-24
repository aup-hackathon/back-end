import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditLog } from '../audit/entities/audit-log.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { User } from '../auth/entities/user.entity';
import { OrgMemberGuard } from './org-member.guard';
import { OrganizationMailerService } from './organization-mailer.service';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, RefreshToken, AuditLog])],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, OrgMemberGuard, OrganizationMailerService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
