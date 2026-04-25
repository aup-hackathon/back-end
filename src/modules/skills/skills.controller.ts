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
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { SkillsService } from './services/skills.service';
import {
  CreateSkillDto,
  UpdateSkillDto,
  SemanticSearchDto,
  ImportSkillsDto,
} from './dto';

type RequestUser = {
  id: string;
  orgId: string;
  role: string;
};

@ApiTags('skills')
@ApiBearerAuth()
@Controller('skills')
@UseGuards(AuthGuard('jwt'))
export class SkillsController {
  constructor(private readonly skillsService: SkillsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new skill' })
  @ApiResponse({ status: 201, description: 'Skill created' })
  create(@Body() dto: CreateSkillDto, @CurrentUser() caller: RequestUser) {
    return this.skillsService.create(dto, caller);
  }

  @Get()
  @ApiOperation({ summary: 'List skills for organization' })
  findAll(
    @Query('type') type?: string,
    @Query('isActive') isActive?: string,
    @CurrentUser() caller?: RequestUser,
  ) {
    return this.skillsService.findAll(
      { type: type as any, isActive: isActive === 'true' },
      caller,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get skill detail with usage stats' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() caller: RequestUser) {
    return this.skillsService.findOne(id, caller);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update skill' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSkillDto,
    @CurrentUser() caller: RequestUser,
  ) {
    return this.skillsService.update(id, dto, caller);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete skill' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() caller: RequestUser) {
    return this.skillsService.remove(id, caller);
  }

  @Post('search')
  @ApiOperation({ summary: 'Semantic search for skills' })
  search(@Body() dto: SemanticSearchDto, @CurrentUser() caller: RequestUser) {
    return this.skillsService.semanticSearch(dto, caller);
  }

  @Post('import')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Import skills in batch' })
  import(@Body() dto: ImportSkillsDto, @CurrentUser() caller: RequestUser) {
    return this.skillsService.importSkills(dto.skills, caller);
  }

  @Get('export')
  @ApiOperation({ summary: 'Export all active skills' })
  export(@CurrentUser() caller: RequestUser) {
    return this.skillsService.exportSkills(caller);
  }

  @Get(':id/applications')
  @ApiOperation({ summary: 'Get skill application history' })
  findApplications(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @CurrentUser() caller?: RequestUser,
  ) {
    return this.skillsService.findApplications(
      id,
      caller,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }
}