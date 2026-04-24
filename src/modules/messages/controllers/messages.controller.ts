import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../../core/decorators/current-user.decorator';
import { MessageResponseDto } from '../dtos';
import { MessagesService } from '../services/messages.service';

@ApiTags('messages')
@ApiBearerAuth()
@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Fetch a single session message by ID.' })
  @ApiOkResponse({ type: MessageResponseDto })
  getMessage(
    @Param('id', new ParseUUIDPipe()) messageId: string,
    @CurrentUser() currentUser: { id: string; orgId: string; role: string },
  ): Promise<MessageResponseDto> {
    return this.messagesService.getMessage(messageId, currentUser);
  }
}
