import { IsString, IsEnum, IsOptional, IsArray, MaxLength, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { SkillType, AgentType } from '../../../database/enums';

export class CreateSkillDto {
  @ApiProperty({ maxLength: 256 })
  @IsString()
  @MaxLength(256)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: SkillType })
  @IsEnum(SkillType)
  skillType: SkillType;

  @ApiProperty()
  @IsString()
  content: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  appliesToDomains?: string[];

  @ApiPropertyOptional({ enum: AgentType, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(AgentType, { each: true })
  appliesToAgents?: AgentType[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isMandatory?: boolean;
}