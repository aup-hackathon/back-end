import { ApiProperty } from '@nestjs/swagger';

import { SkillType, AgentType } from '../../../database/enums';

export class SkillResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ nullable: true })
  description: string | null;

  @ApiProperty({ enum: SkillType })
  skillType: SkillType;

  @ApiProperty()
  content: string;

  @ApiProperty({ nullable: true })
  appliesToDomains: string[] | null;

  @ApiProperty({ nullable: true, enum: AgentType, isArray: true })
  appliesToAgents: AgentType[] | null;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  isMandatory: boolean;

  @ApiProperty()
  usageCount: number;

  @ApiProperty()
  version: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class SkillDetailResponseDto extends SkillResponseDto {
  @ApiProperty()
  applicationCount: number;

  @ApiProperty({ nullable: true })
  avgSimilarityScore: number | null;
}