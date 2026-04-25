import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { UserRole } from '../../database/enums';
import { AuditService } from '../audit/audit.service';
import { AuditLogExportQueryDto, AuditLogExportFormat } from '../audit/dto/audit-log-export-query.dto';
import { AuditLogQueryDto } from '../audit/dto/audit-log-query.dto';
import { WorkflowsService } from './workflows.service';
import { WorkflowExportService } from './services/workflow-export.service';
import {
  CreateWorkflowDto,
  UpdateWorkflowDto,
  UpdateWorkflowWithVersionDto,
  WorkflowFilterDto,
  DuplicateWorkflowDto,
  CreateVersionDto,
  UpdateWorkflowWithVersionInput,
} from './dto/workflow.dto';
import { ExportWorkflowDto, ExportFormat } from './dto/export-workflow.dto';

type RequestUser = { id: string; orgId: string; role: string };

@ApiTags('workflows')
@ApiBearerAuth()
@Controller('workflows')
export class WorkflowsController {
  constructor(
    private readonly workflowsService: WorkflowsService,
    private readonly workflowExportService: WorkflowExportService,
    private readonly auditService: AuditService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new workflow' })
  @ApiResponse({ status: 201, description: 'Workflow created' })
  async create(@Body() dto: CreateWorkflowDto, @CurrentUser() caller: RequestUser) {
    const workflow = await this.workflowsService.create(dto, caller.orgId, caller.id);
    return { workflow };
  }

  @Get()
  @ApiOperation({ summary: 'List all workflows' })
  @ApiResponse({ status: 200, description: 'Workflows list' })
  async findAll(@Query() filter: WorkflowFilterDto, @CurrentUser() caller: RequestUser) {
    const { workflows, total } = await this.workflowsService.findAll(filter, caller.orgId);
    return {
      workflows,
      total,
      page: filter.page ?? 1,
      limit: filter.limit ?? 20,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get workflow by ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() caller: RequestUser) {
    const workflow = await this.workflowsService.findOneWithLatestVersion(id, caller.orgId);
    return { workflow };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update workflow' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkflowDto | UpdateWorkflowWithVersionDto,
    @CurrentUser() caller: RequestUser,
  ) {
    const workflow = await this.workflowsService.update(
      id,
      dto,
      caller.orgId,
      caller.id,
      caller.role,
    );
    return { workflow };
  }

  @Post(':id/versions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new workflow version' })
  async createVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateVersionDto,
    @CurrentUser() caller: RequestUser,
  ) {
    const dtoWithVersion: UpdateWorkflowWithVersionInput = {
      ...dto,
      source: dto.source ?? 'user',
    };
    const workflow = await this.workflowsService.update(
      id,
      dtoWithVersion,
      caller.orgId,
      caller.id,
      caller.role,
    );
    return { workflow };
  }

  @Get(':id/versions')
  @ApiOperation({ summary: 'Get all versions of a workflow' })
  async findVersions(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() caller: RequestUser) {
    const versions = await this.workflowsService.findVersions(id, caller.orgId);
    return { versions };
  }

  @Get(':id/versions/:versionNumber')
  @ApiOperation({ summary: 'Get a specific workflow version' })
  async findVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versionNumber', ParseUUIDPipe) versionNumber: number,
    @CurrentUser() caller: RequestUser,
  ) {
    const version = await this.workflowsService.findVersion(id, versionNumber, caller.orgId);
    return { version };
  }

  @Get(':id/diff/:v1/:v2')
  @ApiOperation({ summary: 'Compute diff between two versions' })
  async computeDiff(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('v1') v1: string,
    @Param('v2') v2: string,
    @CurrentUser() caller: RequestUser,
  ) {
    const diff = await this.workflowsService.computeDiff(
      id,
      parseInt(v1, 10),
      parseInt(v2, 10),
      caller.orgId,
    );
    return { diff };
  }

  @Post(':id/duplicate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Duplicate a workflow' })
  async duplicate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DuplicateWorkflowDto,
    @CurrentUser() caller: RequestUser,
  ) {
    const workflow = await this.workflowsService.duplicate(
      id,
      caller.orgId,
      caller.id,
      dto.title,
    );
    return { workflow };
  }

  @Get(':id/diagram-data')
  @ApiOperation({ summary: 'Get workflow diagram data' })
  async getDiagramData(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() caller: RequestUser) {
    const diagramData = await this.workflowsService.getDiagramData(id, caller.orgId);
    return diagramData;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Archive a workflow' })
  async archive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: RequestUser,
  ) {
    await this.workflowsService.archive(id, caller.orgId, caller.id, caller.role);
  }

  @Get(':id/audit-log')
  @Roles(UserRole.ADMIN, UserRole.PROCESS_OWNER, UserRole.BUSINESS_ANALYST)
  @ApiOperation({ summary: 'Get workflow audit log' })
  async getAuditLog(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: AuditLogQueryDto,
    @CurrentUser() caller: RequestUser,
  ) {
    const result = await this.auditService.getWorkflowAuditLog(id, caller, query);
    return {
      entries: result.entries,
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  @Get(':id/decision-log')
  @Roles(UserRole.ADMIN, UserRole.PROCESS_OWNER, UserRole.BUSINESS_ANALYST)
  async getDecisionLog(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: AuditLogQueryDto,
    @CurrentUser() caller: RequestUser,
  ) {
    const result = await this.auditService.getDecisionLog(id, caller, query);
    return {
      entries: result.entries,
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  @Post(':id/audit-log/export')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Roles(UserRole.ADMIN, UserRole.PROCESS_OWNER, UserRole.BUSINESS_ANALYST)
  async exportAuditLog(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: AuditLogExportQueryDto,
    @CurrentUser() caller: RequestUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const exportFile = await this.auditService.exportWorkflowAuditLog(id, caller, query);
    response.setHeader('Content-Type', exportFile.contentType);
    response.setHeader('Content-Disposition', `attachment; filename="${exportFile.filename}"`);

    if (query.format === AuditLogExportFormat.CSV) {
      response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    }

    return new StreamableFile(exportFile.buffer);
  }

  @Post(':id/export/elsa')
  @HttpCode(HttpStatus.OK)
  async exportToElsa(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: RequestUser,
  ) {
    const validation = await this.workflowExportService.validateExportability(
      id,
      caller.orgId,
      caller.id,
      caller.role,
    );

    if (!validation.canExport) {
      if (validation.reason === 'RECONCILIATION_REQUIRED') {
        throw new ConflictException({
          code: 'RECONCILIATION_REQUIRED',
          unresolved_critical_points: validation.unresolvedCriticalPoints,
        });
      }
      if (validation.reason === 'FORBIDDEN') {
        throw new ForbiddenException({ code: 'FORBIDDEN' });
      }
      if (validation.reason === 'INVALID_STATUS') {
        throw new ConflictException({ code: 'INVALID_STATUS' });
      }
      throw new NotFoundException({ code: 'WORKFLOW_NOT_FOUND' });
    }

    const workflow = await this.workflowsService.findOneWithLatestVersion(id, caller.orgId);
    const versionNumber = workflow.currentVersion;

    const { json, filename } = await this.workflowExportService.exportToElsa(
      id,
      versionNumber,
      caller.id,
      caller.orgId,
    );

    return { json, filename };
  }

  @Post(':id/export/bpmn')
  @HttpCode(HttpStatus.ACCEPTED)
  async exportToBpmn(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: RequestUser,
  ) {
    const validation = await this.workflowExportService.validateExportability(
      id,
      caller.orgId,
      caller.id,
      caller.role,
    );

    if (!validation.canExport) {
      if (validation.reason === 'RECONCILIATION_REQUIRED') {
        throw new ConflictException({
          code: 'RECONCILIATION_REQUIRED',
          unresolved_critical_points: validation.unresolvedCriticalPoints,
        });
      }
      if (validation.reason === 'FORBIDDEN') {
        throw new ForbiddenException({ code: 'FORBIDDEN' });
      }
      if (validation.reason === 'INVALID_STATUS') {
        throw new ConflictException({ code: 'INVALID_STATUS' });
      }
      throw new NotFoundException({ code: 'WORKFLOW_NOT_FOUND' });
    }

    const correlationId = uuidv4();
    const workflow = await this.workflowsService.findOneWithLatestVersion(id, caller.orgId);
    const versionNumber = workflow.currentVersion;

    return this.workflowExportService.exportToBpmnAsync(
      id,
      versionNumber,
      caller.id,
      caller.orgId,
      correlationId,
    );
  }

  @Post(':id/export/pdf')
  @HttpCode(HttpStatus.ACCEPTED)
  async exportToPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: RequestUser,
  ) {
    const validation = await this.workflowExportService.validateExportability(
      id,
      caller.orgId,
      caller.id,
      caller.role,
    );

    if (!validation.canExport) {
      if (validation.reason === 'RECONCILIATION_REQUIRED') {
        throw new ConflictException({
          code: 'RECONCILIATION_REQUIRED',
          unresolved_critical_points: validation.unresolvedCriticalPoints,
        });
      }
      if (validation.reason === 'FORBIDDEN') {
        throw new ForbiddenException({ code: 'FORBIDDEN' });
      }
      if (validation.reason === 'INVALID_STATUS') {
        throw new ConflictException({ code: 'INVALID_STATUS' });
      }
      throw new NotFoundException({ code: 'WORKFLOW_NOT_FOUND' });
    }

    const correlationId = uuidv4();
    const workflow = await this.workflowsService.findOneWithLatestVersion(id, caller.orgId);
    const versionNumber = workflow.currentVersion;

    return this.workflowExportService.exportToPdfAsync(
      id,
      versionNumber,
      caller.id,
      caller.orgId,
      correlationId,
    );
  }
}
