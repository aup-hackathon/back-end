import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

import { CreateSkillDto } from './create-skill.dto';

export class ImportSkillsDto {
  @ApiProperty({ type: [CreateSkillDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSkillDto)
  skills: CreateSkillDto[];
}

export class SkillImportResultDto {
  imported: number;
  failed: Array<{ index: number; error: string }>;
}