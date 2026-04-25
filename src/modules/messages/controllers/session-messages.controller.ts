import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';

import { CurrentUser } from '../../../core/decorators/current-user.decorator';
import {
  CreateMessageDto,
  ListSessionMessagesQueryDto,
  MessageResponseDto,
  PaginatedMessagesDto,
} from '../dtos';
import { MessagesService } from '../services/messages.service';
import { SessionsService } from '../../sessions/sessions.service';

@ApiTags('messages')
@ApiBearerAuth()
@Controller('sessions/:sessionId/messages')
export class SessionMessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly sessionsService: SessionsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create an immutable message inside a session.' })
  @ApiCreatedResponse({ type: MessageResponseDto })
  async createMessage(
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Body() dto: CreateMessageDto,
    @CurrentUser() currentUser: { id: string; orgId: string; role: string },
  ): Promise<MessageResponseDto> {
    const message = await this.messagesService.createMessage(sessionId, dto, currentUser);

    if (dto.role === 'user') {
      await this.sessionsService.dispatchAiTask(
        sessionId,
        { content: dto.content, type: dto.type },
        currentUser,
      );
    }

    return message;
  }

  @Get()
  @ApiOperation({ summary: 'List session messages in chronological order with cursor pagination.' })
  @ApiOkResponse({ type: PaginatedMessagesDto })
  listMessages(
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Query() query: ListSessionMessagesQueryDto,
    @CurrentUser() currentUser: { id: string; orgId: string; role: string },
  ): Promise<PaginatedMessagesDto> {
    return this.messagesService.listSessionMessages(sessionId, query, currentUser);
  }

  @Get('export')
  @ApiOperation({ summary: 'Export the full session transcript as a readable PDF.' })
  @ApiProduces('application/pdf')
  async exportMessages(
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @CurrentUser() currentUser: { id: string; orgId: string; role: string },
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const pdfBuffer = await this.messagesService.exportSessionTranscriptPdf(sessionId, currentUser);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="session-${sessionId}-transcript.pdf"`,
    );

    return new StreamableFile(pdfBuffer);
  }
}
