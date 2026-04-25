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
  Req,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';
import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

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

interface AuthenticatedRequest extends Request {
  user: { id: string; orgId: string; role: string };
}

@Controller('workflows')
@UseGuards(AuthGuard('jwt'))
export class WorkflowsController {
  constructor(
    private readonly workflowsService: WorkflowsService,
    private readonly workflowExportService: WorkflowExportService,
    private readonly auditService: AuditService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateWorkflowDto, @Req() req: AuthenticatedRequest) {
    const workflow = await this.workflowsService.create(dto, req.user.orgId, req.user.id);
    return { workflow };
  }

  @Get()
  async findAll(@Query() filter: WorkflowFilterDto, @Req() req: AuthenticatedRequest) {
    const { workflows, total } = await this.workflowsService.findAll(filter, req.user.orgId);
    return {
      workflows,
      total,
      page: filter.page ?? 1,
      limit: filter.limit ?? 20,
    };
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest) {
    const workflow = await this.workflowsService.findOneWithLatestVersion(id, req.user.orgId);
    return { workflow };
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkflowDto | UpdateWorkflowWithVersionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const workflow = await this.workflowsService.update(
      id,
      dto,
      req.user.orgId,
      req.user.id,
      req.user.role,
    );
    return { workflow };
  }

  @Post(':id/versions')
  @HttpCode(HttpStatus.CREATED)
  async createVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateVersionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const dtoWithVersion: UpdateWorkflowWithVersionInput = {
      ...dto,
      source: dto.source ?? 'user',
    };
    const workflow = await this.workflowsService.update(
      id,
      dtoWithVersion,
      req.user.orgId,
      req.user.id,
      req.user.role,
    );
    return { workflow };
  }

  @Get(':id/versions')
  async findVersions(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest) {
    const versions = await this.workflowsService.findVersions(id, req.user.orgId);
    return { versions };
  }

  @Get(':id/versions/:versionNumber')
  async findVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versionNumber', ParseUUIDPipe) versionNumber: number,
    @Req() req: AuthenticatedRequest,
  ) {
    const version = await this.workflowsService.findVersion(id, versionNumber, req.user.orgId);
    return { version };
  }

  @Get(':id/diff/:v1/:v2')
  async computeDiff(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('v1') v1: string,
    @Param('v2') v2: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const diff = await this.workflowsService.computeDiff(
      id,
      parseInt(v1, 10),
      parseInt(v2, 10),
      req.user.orgId,
    );
    return { diff };
  }

  @Post(':id/duplicate')
  @HttpCode(HttpStatus.CREATED)
  async duplicate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DuplicateWorkflowDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const workflow = await this.workflowsService.duplicate(
      id,
      req.user.orgId,
      req.user.id,
      dto.title,
    );
    return { workflow };
  }

  @Get(':id/diagram-data')
  async getDiagramData(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest) {
    const diagramData = await this.workflowsService.getDiagramData(id, req.user.orgId);
    return diagramData;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.workflowsService.archive(id, req.user.orgId, req.user.id, req.user.role);
  }

  @Get(':id/audit-log')
  @Roles(UserRole.ADMIN, UserRole.PROCESS_OWNER, UserRole.BUSINESS_ANALYST)
  async getAuditLog(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: AuditLogQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const result = await this.auditService.getWorkflowAuditLog(id, req.user, query);
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
    @Req() req: AuthenticatedRequest,
  ) {
    const result = await this.auditService.getDecisionLog(id, req.user, query);
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
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const exportFile = await this.auditService.exportWorkflowAuditLog(id, req.user, query);
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
    @Req() req: AuthenticatedRequest,
  ) {
    const validation = await this.workflowExportService.validateExportability(
      id,
      req.user.orgId,
      req.user.id,
      req.user.role,
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

    const workflow = await this.workflowsService.findOneWithLatestVersion(id, req.user.orgId);
    const versionNumber = workflow.currentVersion;

    const { json, filename } = await this.workflowExportService.exportToElsa(
      id,
      versionNumber,
      req.user.id,
      req.user.orgId,
    );

    return { json, filename };
  }

  @Post(':id/export/bpmn')
  @HttpCode(HttpStatus.ACCEPTED)
  async exportToBpmn(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const validation = await this.workflowExportService.validateExportability(
      id,
      req.user.orgId,
      req.user.id,
      req.user.role,
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
    const workflow = await this.workflowsService.findOneWithLatestVersion(id, req.user.orgId);
    const versionNumber = workflow.currentVersion;

    return this.workflowExportService.exportToBpmnAsync(
      id,
      versionNumber,
      req.user.id,
      req.user.orgId,
      correlationId,
    );
  }

  @Post(':id/export/pdf')
  @HttpCode(HttpStatus.ACCEPTED)
  async exportToPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const validation = await this.workflowExportService.validateExportability(
      id,
      req.user.orgId,
      req.user.id,
      req.user.role,
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
    const workflow = await this.workflowsService.findOneWithLatestVersion(id, req.user.orgId);
    const versionNumber = workflow.currentVersion;

    return this.workflowExportService.exportToPdfAsync(
      id,
      versionNumber,
      req.user.id,
      req.user.orgId,
      correlationId,
    );
  }
}
