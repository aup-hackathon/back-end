import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';

import { CurrentUser } from '../../../core/decorators/current-user.decorator';
import { SkillsService } from '../services/skills.service';

type RequestUser = {
  id: string;
  orgId: string;
  role: string;
};

@ApiTags('agent-executions-skills')
@ApiBearerAuth()
@Controller('agent-executions')
@UseGuards(AuthGuard('jwt'))
export class AgentExecutionsSkillsController {
  constructor(private readonly skillsService: SkillsService) {}

  @Get(':id/skills')
  @ApiOperation({ summary: 'Get skills applied to an agent execution' })
  getExecutionSkills(@Param('id') id: string, @CurrentUser() caller: RequestUser) {
    return this.skillsService.findApplicationsByExecution(id, caller);
  }
}