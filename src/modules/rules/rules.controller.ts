import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { UserRole } from '../../database/enums';
import { CreateRuleDto, ImportRulesBundleDto, RulesFilterDto, TestRuleDto, UpdateRuleDto } from './dto/rules.dto';
import { RulesService } from './rules.service';

type RequestUser = {
  id: string;
  orgId: string;
  role: UserRole | string;
};

@ApiTags('rules')
@ApiBearerAuth()
@Controller()
export class RulesController {
  constructor(private readonly rulesService: RulesService) {}

  @Post('rules')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS_ANALYST)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new rule' })
  @ApiResponse({ status: 201, description: 'Rule created' })
  create(@Body() dto: CreateRuleDto, @CurrentUser() caller: RequestUser) {
    return this.rulesService.create(dto, caller);
  }

  @Get('rules')
  @ApiOperation({ summary: 'List all rules for organization' })
  @ApiResponse({ status: 200, description: 'Rules list' })
  findAll(@Query() filter: RulesFilterDto, @CurrentUser() caller: RequestUser) {
    return this.rulesService.findAll(filter, caller.orgId);
  }

  @Get('rules/export')
  @ApiOperation({ summary: 'Export rules as JSON bundle' })
  @ApiResponse({ status: 200, description: 'Rules bundle JSON' })
  async exportRules(
    @CurrentUser() caller: RequestUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    const bundle = await this.rulesService.exportRules(caller.orgId);
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Content-Disposition', 'attachment; filename="rules-bundle.json"');
    return bundle;
  }

  @Post('rules/import')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS_ANALYST)
  @ApiOperation({ summary: 'Import rules from JSON bundle' })
  importRules(@Body() dto: ImportRulesBundleDto, @CurrentUser() caller: RequestUser) {
    return this.rulesService.importRules(dto, caller);
  }

  @Get('rules/:id')
  @ApiOperation({ summary: 'Get rule by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() caller: RequestUser) {
    return this.rulesService.findOne(id, caller.orgId);
  }

  @Patch('rules/:id')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS_ANALYST)
  @ApiOperation({ summary: 'Update a rule' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRuleDto,
    @CurrentUser() caller: RequestUser,
  ) {
    return this.rulesService.update(id, dto, caller);
  }

  @Post('rules/:id/activate')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS_ANALYST)
  @ApiOperation({ summary: 'Activate a rule' })
  activate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() caller: RequestUser) {
    return this.rulesService.activate(id, caller);
  }

  @Post('rules/:id/deactivate')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS_ANALYST)
  @ApiOperation({ summary: 'Deactivate a rule' })
  deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() caller: RequestUser) {
    return this.rulesService.deactivate(id, caller);
  }

  @Delete('rules/:id')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS_ANALYST)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete a rule' })
  async softDelete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() caller: RequestUser) {
    await this.rulesService.softDelete(id, caller);
  }

  @Post('rules/:id/test')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS_ANALYST)
  @ApiOperation({ summary: 'Test a rule with sample data' })
  testRule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TestRuleDto,
    @CurrentUser() caller: RequestUser,
  ) {
    return this.rulesService.testRule(id, dto, caller);
  }

  @Get('sessions/:id/rules/preview')
  previewSessionRules(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() caller: RequestUser) {
    return this.rulesService.previewForSession(id, caller);
  }

  @Get('agent-executions/:id/rules')
  listAgentExecutionRules(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() caller: RequestUser) {
    return this.rulesService.listRuleApplicationsForAgentExecution(id, caller.orgId);
  }
}
