import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';

import { CurrentUser } from '../../../core/decorators/current-user.decorator';
import { Roles } from '../../../core/decorators/roles.decorator';
import { UserRole } from '../../../database/enums';
import { SkillsService } from '../services/skills.service';

type RequestUser = {
  id: string;
  orgId: string;
  role: string;
};

@ApiTags('admin-skills')
@ApiBearerAuth()
@Controller('admin/skills')
@UseGuards(AuthGuard('jwt'))
export class AdminSkillsController {
  constructor(private readonly skillsService: SkillsService) {}

  @Get('analytics')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get skill analytics - Admin only' })
  getAnalytics(@CurrentUser() caller: RequestUser) {
    return this.skillsService.getAnalytics(caller);
  }
}