import { IsDateString, IsNumber, IsUUID, Max, Min } from 'class-validator';

export class SessionFinalizedPayload {
  @IsUUID()
  session_id: string;

  @IsUUID()
  workflow_id: string;

  @IsNumber()
  final_version_number: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  final_confidence: number;

  @IsDateString()
  finalized_at: string;
}
