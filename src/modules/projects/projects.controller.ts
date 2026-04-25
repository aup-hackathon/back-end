import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

import { CreateProjectDto, ProjectFilterDto } from './dto/project.dto';
import { ProjectsService } from './projects.service';

interface AuthenticatedRequest extends Request {
  user: { id: string; orgId: string; role: string };
}

@ApiTags('projects')
@ApiBearerAuth()
@Controller('projects')
@UseGuards(AuthGuard('jwt'))
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new project' })
  @ApiResponse({ status: 201, description: 'Project created' })
  async create(@Body() dto: CreateProjectDto, @Req() req: AuthenticatedRequest) {
    const project = await this.projectsService.create(dto, req.user.orgId, req.user.id);
    return { project };
  }

  @Get()
  @ApiOperation({ summary: 'List all projects' })
  @ApiResponse({ status: 200, description: 'Projects list' })
  async findAll(@Query() filter: ProjectFilterDto, @Req() req: AuthenticatedRequest) {
    const { projects, total } = await this.projectsService.findAll(filter, req.user.orgId);
    return {
      projects,
      total,
      page: filter.page ?? 1,
      limit: filter.limit ?? 20,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get project by ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest) {
    const project = await this.projectsService.findOne(id, req.user.orgId);
    return { project };
  }

  @Get(':id/workflows')
  @ApiOperation({ summary: 'List workflows in project' })
  async findWorkflows(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() filter: ProjectFilterDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const { workflows, total } = await this.projectsService.findWorkflows(
      id,
      req.user.orgId,
      filter,
    );
    return {
      workflows,
      total,
      page: filter.page ?? 1,
      limit: filter.limit ?? 20,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a project' })
  async delete(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest) {
    await this.projectsService.delete(id, req.user.orgId, req.user.id);
  }
}