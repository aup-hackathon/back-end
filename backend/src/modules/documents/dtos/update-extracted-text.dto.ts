import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class UpdateExtractedTextDto {
  @ApiProperty({
    description: 'User-corrected extracted text that should be used by the AI pipeline.',
  })
  @IsString()
  extractedText: string;
}
