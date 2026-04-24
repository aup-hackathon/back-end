import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';

import { SessionMode } from '../../../database/enums';

export class CreateSessionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  workflowId: string;

  @ApiProperty({ enum: SessionMode })
  @IsEnum(SessionMode)
  mode: SessionMode;
}
