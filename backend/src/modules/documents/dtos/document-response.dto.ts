import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DocumentResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  workflowId: string;

  @ApiProperty({ format: 'uuid' })
  sessionId: string;

  @ApiProperty()
  filename: string;

  @ApiProperty()
  fileType: string;

  @ApiProperty()
  storageUrl: string;

  @ApiProperty()
  fileSizeBytes: number;

  @ApiProperty()
  docVersion: number;

  @ApiPropertyOptional()
  presignedUrl?: string;

  @ApiProperty()
  createdAt: string;

  @ApiPropertyOptional()
  deletedAt?: string | null;
}
