import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { AgentType, RuleScope, RuleType } from '../../../database/enums';

export class CreateRuleDto {
  @IsString()
  @MaxLength(256)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(RuleType)
  type: RuleType;

  @IsEnum(RuleScope)
  scope: RuleScope;

  @IsOptional()
  @IsUUID()
  workflow_id?: string;

  @IsOptional()
  @IsEnum(AgentType)
  target_agent?: AgentType;

  @IsOptional()
  @IsObject()
  condition?: Record<string, unknown>;

  @IsString()
  instruction: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priority?: number;
}

export class UpdateRuleDto {
  @IsOptional()
  @IsString()
  instruction?: string;

  @IsOptional()
  @IsObject()
  condition?: Record<string, unknown> | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class RulesFilterDto {
  @IsOptional()
  @IsEnum(RuleType)
  type?: RuleType;

  @IsOptional()
  @IsEnum(RuleScope)
  scope?: RuleScope;

  @IsOptional()
  @IsEnum(AgentType)
  agent_type?: AgentType;
}

export class RuleBundleRuleDto {
  @IsString()
  @MaxLength(256)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(RuleType)
  type: RuleType;

  @IsEnum(RuleScope)
  scope: RuleScope;

  @IsOptional()
  @IsUUID()
  workflow_id?: string;

  @IsOptional()
  @IsEnum(AgentType)
  target_agent?: AgentType;

  @IsOptional()
  @IsObject()
  condition?: Record<string, unknown>;

  @IsString()
  instruction: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class ImportRulesBundleDto {
  @IsString()
  schema_version: string;

  @IsOptional()
  @IsString()
  exported_at?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RuleBundleRuleDto)
  rules: RuleBundleRuleDto[];
}

export class TestRuleDto {
  @IsString()
  sample_text: string;

  @IsEnum(AgentType)
  simulate_agent: AgentType;
}
