import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional } from 'class-validator';

import { UserRole } from '../../../database/enums';

export class InviteUserDto {
  @ApiProperty({ example: 'analyst@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ enum: UserRole, required: false, default: UserRole.VIEWER })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
