import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DocumentExtractedTextDto {
  @ApiProperty({ format: 'uuid' })
  documentId: string;

  @ApiProperty()
  docVersion: number;

  @ApiPropertyOptional({ nullable: true })
  extractedText: string | null;

  @ApiPropertyOptional({ nullable: true })
  preprocessingConfidence: number | null;
}
