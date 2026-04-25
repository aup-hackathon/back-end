import { ApiProperty } from '@nestjs/swagger';

export class SkillExportDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ nullable: true })
  description: string | null;

  @ApiProperty()
  skillType: string;

  @ApiProperty()
  content: string;

  @ApiProperty({ nullable: true })
  appliesToDomains: string[] | null;

  @ApiProperty({ nullable: true })
  appliesToAgents: string[] | null;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  isMandatory: boolean;

  @ApiProperty()
  version: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class SkillApplicationResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  skillId: string;

  @ApiProperty()
  agentExecutionId: string;

  @ApiProperty({ nullable: true })
  retrievalRank: number | null;

  @ApiProperty({ nullable: true })
  similarityScore: number | null;

  @ApiProperty()
  injectedTokens: number;

  @ApiProperty()
  wasMandatory: boolean;

  @ApiProperty()
  createdAt: Date;
}

export class SkillAnalyticsDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  applicationCount: number;

  @ApiProperty({ nullable: true })
  avgSimilarity: number | null;

  @ApiProperty({ nullable: true })
  avgTokens: number | null;

  @ApiProperty({ nullable: true })
  avgConfidenceDelta: number | null;
}