import { IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class PipelineDivergenceResultPayload {
  @IsUUID()
  correlation_id: string;

  @IsUUID()
  report_id: string;

  @IsUUID()
  session_id: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  similarity_score: number;

  @IsOptional()
  @IsString()
  status?: string;
}
