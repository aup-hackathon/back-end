import { IsString, IsEnum, IsOptional, IsArray, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { SkillType } from '../../../database/enums';

export class SkillFilterDto {
  @ApiPropertyOptional({ enum: SkillType })
  @IsOptional()
  @IsEnum(SkillType)
  type?: SkillType;

  @ApiPropertyOptional()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional()
  @Type(() => Number)
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional()
  @Type(() => Number)
  @Min(1)
  limit?: number = 20;
}