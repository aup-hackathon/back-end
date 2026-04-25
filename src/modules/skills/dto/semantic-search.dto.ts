import { IsString, IsEnum, IsOptional, IsArray, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { SkillType } from '../../../database/enums';

export class SemanticSearchDto {
  @ApiProperty()
  @IsString()
  queryText: string;

  @ApiPropertyOptional({ default: 5 })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  topK?: number = 5;

  @ApiPropertyOptional({ enum: SkillType, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(SkillType, { each: true })
  filterTypes?: SkillType[];

  @ApiPropertyOptional({ default: 0.35 })
  @IsOptional()
  @Type(() => Number)
  minSimilarity?: number = 0.35;
}

export class SemanticSearchResultDto {
  id: string;
  name: string;
  skillType: SkillType;
  similarityScore: number;
  contentPreview: string;
}