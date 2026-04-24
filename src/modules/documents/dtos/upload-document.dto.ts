import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class UploadDocumentDto {
  @ApiProperty({
    format: 'uuid',
    description: 'The session the uploaded document belongs to.',
  })
  @IsUUID()
  sessionId: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Optional workflow identifier. When provided, it must match the workflow linked to the session.',
  })
  @IsOptional()
  @IsUUID()
  workflowId?: string;
}
