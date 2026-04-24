import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '@core/decorators/current-user.decorator';
import { JwtAuthGuard } from '@core/guards/jwt-auth.guard';

import { DocumentResponseDto } from '../dtos';
import { DocumentsService } from '../services';

@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workflows')
export class WorkflowDocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get(':workflowId/documents')
  @ApiOperation({ summary: 'List the active documents linked to a workflow.' })
  @ApiOkResponse({ type: DocumentResponseDto, isArray: true })
  listDocuments(
    @Param('workflowId', new ParseUUIDPipe()) workflowId: string,
    @CurrentUser() currentUser: { id: string; orgId: string; role: string },
  ): Promise<DocumentResponseDto[]> {
    return this.documentsService.listWorkflowDocuments(workflowId, currentUser);
  }
}
