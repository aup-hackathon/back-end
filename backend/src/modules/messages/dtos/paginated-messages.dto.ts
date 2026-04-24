import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { MessageResponseDto } from './message-response.dto';

export class PaginatedMessagesDto {
  @ApiProperty({ type: MessageResponseDto, isArray: true })
  items: MessageResponseDto[];

  @ApiPropertyOptional({
    description: 'Opaque cursor to request the next page.',
    nullable: true,
  })
  next_cursor: string | null;
}
