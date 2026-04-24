import { IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class DocumentPreprocessEvent {
  [key: string]: unknown;

  @IsUUID()
  document_id: string;

  @IsString()
  file_type: string;

  @IsString()
  storage_url: string;
}

export class DocumentPreprocessResultEvent {
  [key: string]: unknown;

  @IsUUID()
  document_id: string;

  @IsString()
  extracted_text: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  preprocessing_confidence?: number | null;
}
