import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { UserRole } from '../../database/enums';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionModeDto } from './dto/update-session-mode.dto';
import { UpdateSessionStatusDto } from './dto/update-session-status.dto';
import { SessionOrgGuard } from './session-org.guard';
import { SessionsService } from './sessions.service';

type RequestUser = {
  id: string;
  orgId: string;
  role: UserRole | string;
};

@ApiTags('sessions')
@ApiBearerAuth()
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post()
  @ApiOperation({ summary: 'Create an elicitation session for a workflow' })
  @ApiResponse({ status: 201, description: 'Session created' })
  create(@Body() dto: CreateSessionDto, @CurrentUser() caller: RequestUser) {
    return this.sessionsService.createSession(dto, caller);
  }

  @Get(':id')
  @UseGuards(SessionOrgGuard)
  @ApiOperation({ summary: 'Get session lifecycle state' })
  get(@Param('id') sessionId: string, @CurrentUser() caller: RequestUser) {
    return this.sessionsService.getSession(sessionId, caller);
  }

  @Patch(':id/mode')
  @UseGuards(SessionOrgGuard)
  @ApiOperation({ summary: 'Switch session mode' })
  updateMode(
    @Param('id') sessionId: string,
    @Body() dto: UpdateSessionModeDto,
    @CurrentUser() caller: RequestUser,
  ) {
    return this.sessionsService.updateMode(sessionId, dto, caller);
  }

  @Post(':id/finalize')
  @UseGuards(SessionOrgGuard)
  @ApiOperation({ summary: 'Finalize session into draft ready state' })
  finalize(@Param('id') sessionId: string, @CurrentUser() caller: RequestUser) {
    return this.sessionsService.finalize(sessionId, caller);
  }

  @Get(':id/workflow-state')
  @UseGuards(SessionOrgGuard)
  @ApiOperation({ summary: 'Get latest workflow elements for this session' })
  getWorkflowState(@Param('id') sessionId: string, @CurrentUser() caller: RequestUser) {
    return this.sessionsService.getWorkflowState(sessionId, caller);
  }

  @Get(':id/progress')
  @UseGuards(SessionOrgGuard)
  @ApiOperation({ summary: 'Get latest AI pipeline progress for this session' })
  getProgress(@Param('id') sessionId: string, @CurrentUser() caller: RequestUser) {
    return this.sessionsService.getProgress(sessionId, caller);
  }

  @Delete(':id')
  @UseGuards(SessionOrgGuard)
  @ApiOperation({ summary: 'Archive a session and related rows' })
  archive(@Param('id') sessionId: string, @CurrentUser() caller: RequestUser) {
    return this.sessionsService.archive(sessionId, caller);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN)
  @UseGuards(SessionOrgGuard)
  @ApiOperation({ summary: 'Admin-only manual session status override' })
  overrideStatus(
    @Param('id') sessionId: string,
    @Body() dto: UpdateSessionStatusDto,
    @CurrentUser() caller: RequestUser,
  ) {
    return this.sessionsService.overrideStatus(sessionId, dto, caller);
  }
}
