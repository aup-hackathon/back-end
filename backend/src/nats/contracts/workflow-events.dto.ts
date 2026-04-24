import { IsArray, IsIn, IsNumber, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class WorkflowChangedElementPayload {
  @IsString()
  element_id: string;

  @IsIn(['added', 'removed', 'modified'])
  change_type: 'added' | 'removed' | 'modified';
}

export class WorkflowUpdatedPayload {
  @IsUUID()
  workflow_id: string;

  @IsNumber()
  version_number: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowChangedElementPayload)
  changed_elements: WorkflowChangedElementPayload[];

  @IsIn(['ai', 'user', 'comment_injection', 'reconciliation'])
  source: 'ai' | 'user' | 'comment_injection' | 'reconciliation';

  @IsOptional()
  @IsUUID()
  actor_id?: string;

  @IsUUID()
  correlation_id: string;
}
