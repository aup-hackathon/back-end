import { IsArray, IsEnum, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';

import { WorkflowStatus } from '../../../database/enums';

export class CreateWorkflowDto {
  @IsUUID()
  projectId: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  domain?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class UpdateWorkflowDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  domain?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class UpdateWorkflowWithVersionDto extends UpdateWorkflowDto {
  @IsOptional()
  @IsEnum(WorkflowStatus)
  status?: WorkflowStatus;

  @IsOptional()
  @IsArray()
  elements_json?: Record<string, unknown>[];

  @IsOptional()
  @IsEnum(['ai', 'user', 'reconciliation'])
  source?: 'ai' | 'user' | 'reconciliation';
}

export class WorkflowFilterDto {
  @IsOptional()
  @IsEnum(WorkflowStatus)
  status?: WorkflowStatus;

  @IsOptional()
  @IsString()
  domain?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Min(0)
  min_similarity?: number;

  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;
}

export class WorkflowVersionParamDto {
  @IsUUID()
  id: string;

  @IsOptional()
  @Min(1)
  versionNumber?: number;
}

export class WorkflowDiffParamDto {
  @IsUUID()
  id: string;

  @IsUUID()
  v1: string;

  @IsUUID()
  v2: string;
}

export class DuplicateWorkflowDto {
  @IsOptional()
  @IsString()
  title?: string;
}

export class CreateVersionDto {
  @IsArray()
  @IsOptional()
  elements_json?: Record<string, unknown>[];

  @IsOptional()
  @IsEnum(['ai', 'user', 'reconciliation'])
  source?: 'ai' | 'user' | 'reconciliation';
}

export type UpdateWorkflowWithVersionInput = UpdateWorkflowWithVersionDto & { source?: 'ai' | 'user' | 'reconciliation' };