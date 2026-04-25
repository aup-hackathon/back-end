import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { CreateProjectDto, ProjectFilterDto } from './dto/project.dto';
import { ProjectsService } from './projects.service';

type RequestUser = { id: string; orgId: string; role: string };

@ApiTags('projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new project' })
  @ApiResponse({ status: 201, description: 'Project created' })
  async create(@Body() dto: CreateProjectDto, @CurrentUser() caller: RequestUser) {
    const project = await this.projectsService.create(dto, caller.orgId, caller.id);
    return { project };
  }

  @Get()
  @ApiOperation({ summary: 'List all projects' })
  @ApiResponse({ status: 200, description: 'Projects list' })
  async findAll(@Query() filter: ProjectFilterDto, @CurrentUser() caller: RequestUser) {
    const { projects, total } = await this.projectsService.findAll(filter, caller.orgId);
    return {
      projects,
      total,
      page: filter.page ?? 1,
      limit: filter.limit ?? 20,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get project by ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() caller: RequestUser) {
    const project = await this.projectsService.findOne(id, caller.orgId);
    return { project };
  }

  @Get(':id/workflows')
  @ApiOperation({ summary: 'List workflows in project' })
  async findWorkflows(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() filter: ProjectFilterDto,
    @CurrentUser() caller: RequestUser,
  ) {
    const { workflows, total } = await this.projectsService.findWorkflows(
      id,
      caller.orgId,
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
  async delete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() caller: RequestUser) {
    await this.projectsService.delete(id, caller.orgId, caller.id);
  }
}