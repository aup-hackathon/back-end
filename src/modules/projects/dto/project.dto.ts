import { IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProjectDto {
  @IsString()
  name: string;
}

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  name?: string;
}

export class ProjectFilterDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  limit?: number = 20;
}