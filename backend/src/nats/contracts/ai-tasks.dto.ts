import {
  IsEnum,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import {
  AgentExecutionStatus,
  AgentType,
  LogLevel,
  PipelineTaskType,
  SessionMode,
} from '../../database/enums';

export class AiScopedTargetPayload {
  @IsOptional()
  @IsUUID()
  comment_id?: string;

  @IsOptional()
  @IsString()
  element_id?: string;
}

export class AiTaskNewPayload {
  @IsUUID()
  correlation_id: string;

  @IsUUID()
  session_id: string;

  @IsUUID()
  org_id: string;

  @IsEnum(PipelineTaskType)
  task_type: PipelineTaskType;

  @IsEnum(SessionMode)
  mode: SessionMode;

  @IsObject()
  input: Record<string, unknown>;

  @IsUUID()
  pipeline_execution_id: string;

  @IsOptional()
  @IsEnum(AgentType)
  resume_from_checkpoint?: AgentType;

  @IsOptional()
  @ValidateNested()
  @Type(() => AiScopedTargetPayload)
  scoped_target?: AiScopedTargetPayload;

  @IsOptional()
  @IsUUID()
  triggered_by?: string;
}

export class AgentLogPayload {
  @IsEnum(LogLevel)
  level: LogLevel;

  @IsString()
  message: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class AiTaskProgressPayload {
  @IsUUID()
  correlation_id: string;

  @IsUUID()
  session_id: string;

  @IsUUID()
  org_id: string;

  @IsUUID()
  pipeline_execution_id: string;

  @IsUUID()
  agent_execution_id: string;

  @IsEnum(AgentType)
  agent_type: AgentType;

  @IsString()
  agent_name: string;

  @IsEnum(AgentExecutionStatus)
  status: AgentExecutionStatus;

  @IsNumber()
  order_index: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  progress_pct: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence_input?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence_output?: number;

  @IsOptional()
  @IsNumber()
  llm_calls_delta?: number;

  @IsOptional()
  @IsNumber()
  tokens_delta?: number;

  @IsOptional()
  @IsString()
  started_at?: string;

  @IsOptional()
  @IsString()
  completed_at?: string;

  @IsOptional()
  @IsString()
  error_message?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AgentLogPayload)
  log?: AgentLogPayload;
}

export class AiTaskResultPayload {
  @IsUUID()
  correlation_id: string;

  @IsUUID()
  session_id: string;

  @IsUUID()
  org_id: string;

  @IsUUID()
  pipeline_execution_id: string;

  @IsOptional()
  @IsObject()
  workflow_json?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  elsa_json?: Record<string, unknown>;

  @IsNumber()
  @Min(0)
  @Max(1)
  confidence: number;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsNumber()
  version_number?: number;

  @IsOptional()
  @IsIn(['ai', 'user', 'comment_injection', 'reconciliation'])
  source?: 'ai' | 'user' | 'comment_injection' | 'reconciliation';
}

export class AiTaskDivergencePayload {
  @IsUUID()
  correlation_id: string;

  @IsUUID()
  report_id: string;

  @IsUUID()
  graph_a_id: string;

  @IsUUID()
  graph_b_id: string;

  @IsString()
  comparison_type: string;

  @IsUUID()
  session_id: string;
}

export class AiContextLoadPayload {
  @IsUUID()
  correlation_id: string;

  @IsUUID()
  session_id: string;

  @IsUUID()
  org_id: string;

  @IsObject({ each: true })
  active_rules: Record<string, unknown>[];

  @IsString({ each: true })
  skill_ids: string[];
}
