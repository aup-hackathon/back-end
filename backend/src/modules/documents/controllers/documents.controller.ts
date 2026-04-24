import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { CurrentUser } from '@core/decorators/current-user.decorator';
import { JwtAuthGuard } from '@core/guards/jwt-auth.guard';

import {
  DocumentExtractedTextDto,
  DocumentResponseDto,
  UpdateExtractedTextDto,
  UploadDocumentDto,
} from '../dtos';
import { DocumentsService } from '../services';
import { MAX_DOCUMENT_FILE_SIZE_BYTES } from '../utils/document.constants';

@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload a workflow document to MinIO.' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['sessionId', 'file'],
      properties: {
        sessionId: { type: 'string', format: 'uuid' },
        workflowId: { type: 'string', format: 'uuid' },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOkResponse({ type: DocumentResponseDto })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: MAX_DOCUMENT_FILE_SIZE_BYTES,
      },
    }),
  )
  uploadDocument(
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() currentUser: { id: string; orgId: string; role: string },
  ): Promise<DocumentResponseDto> {
    return this.documentsService.uploadDocument(dto, file, currentUser);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get document metadata and a fresh presigned download URL.' })
  @ApiOkResponse({ type: DocumentResponseDto })
  getDocument(
    @Param('id', new ParseUUIDPipe()) documentId: string,
    @CurrentUser() currentUser: { id: string; orgId: string; role: string },
  ): Promise<DocumentResponseDto> {
    return this.documentsService.getDocument(documentId, currentUser);
  }

  @Get(':id/extracted-text')
  @ApiOperation({ summary: 'Get the current extracted text for a document.' })
  @ApiOkResponse({ type: DocumentExtractedTextDto })
  getExtractedText(
    @Param('id', new ParseUUIDPipe()) documentId: string,
    @CurrentUser() currentUser: { id: string; orgId: string; role: string },
  ): Promise<DocumentExtractedTextDto> {
    return this.documentsService.getExtractedText(documentId, currentUser);
  }

  @Patch(':id/extracted-text')
  @ApiOperation({ summary: 'Update extracted text for a document and audit the change.' })
  @ApiOkResponse({ type: DocumentExtractedTextDto })
  updateExtractedText(
    @Param('id', new ParseUUIDPipe()) documentId: string,
    @Body() dto: UpdateExtractedTextDto,
    @CurrentUser() currentUser: { id: string; orgId: string; role: string },
  ): Promise<DocumentExtractedTextDto> {
    return this.documentsService.updateExtractedText(documentId, dto, currentUser);
  }

  @Post(':id/reprocess')
  @HttpCode(202)
  @ApiOperation({ summary: 'Create a new document version and re-trigger preprocessing.' })
  @ApiAcceptedResponse({ type: DocumentResponseDto })
  reprocessDocument(
    @Param('id', new ParseUUIDPipe()) documentId: string,
    @CurrentUser() currentUser: { id: string; orgId: string; role: string },
  ): Promise<DocumentResponseDto> {
    return this.documentsService.reprocessDocument(documentId, currentUser);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Soft-delete a document without removing the underlying MinIO object.' })
  @ApiNoContentResponse()
  async deleteDocument(
    @Param('id', new ParseUUIDPipe()) documentId: string,
    @CurrentUser() currentUser: { id: string; orgId: string; role: string },
  ): Promise<void> {
    await this.documentsService.softDeleteDocument(documentId, currentUser);
  }
}
