import { IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

import { AI_DECISION_FILTER } from '../audit.constants';

export enum AuditLogExportFormat {
  CSV = 'csv',
  PDF = 'pdf',
}

export class AuditLogExportQueryDto {
  @IsEnum(AuditLogExportFormat)
  format: AuditLogExportFormat;

  @IsOptional()
  @IsString()
  type?: typeof AI_DECISION_FILTER | string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  actor_id?: string;
}

