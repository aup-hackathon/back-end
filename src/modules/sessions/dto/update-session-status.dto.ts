import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

import { SessionStatus } from '../../../database/enums';

export class UpdateSessionStatusDto {
  @ApiProperty({ enum: SessionStatus })
  @IsEnum(SessionStatus)
  status: SessionStatus;

  @ApiProperty({ example: 'Manual operator correction after reviewing transcript.' })
  @IsString()
  @MinLength(3)
  reason: string;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
