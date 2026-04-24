import { ApiProperty } from '@nestjs/swagger';

import { MessageRole, MessageType } from '../../../database/enums';

export class MessageResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  sessionId: string;

  @ApiProperty({ enum: MessageRole })
  role: MessageRole;

  @ApiProperty({ enum: MessageType })
  type: MessageType;

  @ApiProperty()
  content: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  metadata: Record<string, unknown>;

  @ApiProperty()
  createdAt: string;
}
