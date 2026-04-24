import { IsEnum, IsOptional, IsUUID, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ExportFormat {
  ELSA = 'elsa',
  BPMN = 'bpmn',
  PDF = 'pdf',
}

export class ExportWorkflowDto {
  @ApiProperty({ enum: ExportFormat })
  @IsEnum(ExportFormat)
  format: ExportFormat;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  versionId?: number;
}

export class ExportStatusDto {
  @ApiProperty()
  @IsUUID()
  pipelineExecutionId: string;
}

export class ExportResponseDto {
  @ApiProperty()
  pipelineExecutionId: string;

  @ApiProperty()
  statusUrl: string;

  @ApiPropertyOptional()
  @IsOptional()
  downloadUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  artifactUri?: string;
}

export class ElsaExportResponseDto {
  @ApiProperty()
  json: object;

  @ApiProperty()
  filename: string;

  @ApiProperty()
  artifactUri: string;
}