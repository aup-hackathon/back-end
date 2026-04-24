import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

import { SessionMode } from '../../../database/enums';

export class UpdateSessionModeDto {
  @ApiProperty({ enum: SessionMode })
  @IsEnum(SessionMode)
  mode: SessionMode;
}
