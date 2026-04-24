import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

import { CommentType } from '../../../database/enums';

export class CreateCommentDto {
  @IsOptional()
  @IsString()
  element_id?: string;

  @IsEnum(CommentType)
  type: CommentType;

  @IsString()
  content: string;
}

export class UpdateCommentDto {
  @IsString()
  content: string;
}

export class ResolveCommentDto {
  @IsString()
  resolution_note: string;
}

export class CreateReplyDto {
  @IsString()
  content: string;
}

export class AssignCommentDto {
  @IsUUID()
  assignee_id: string;
}

export class InjectToAiDto {
  @IsOptional()
  @IsString()
  session_id?: string;
}

export class ListCommentsQueryDto {
  @IsOptional()
  @IsEnum(['true', 'false'])
  resolved?: 'true' | 'false';

  @IsOptional()
  @IsEnum(CommentType)
  type?: CommentType;

  @IsOptional()
  @IsString()
  element_id?: string;
}