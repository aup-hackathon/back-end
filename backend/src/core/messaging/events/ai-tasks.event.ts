export interface AiScopedTarget {
  comment_id?: string;
  element_id?: string;
}

export interface AiTaskNewEvent {
  correlation_id: string;
  session_id: string;
  org_id: string;
  task_type: string;
  mode: string;
  input: Record<string, unknown>;
  pipeline_execution_id: string;
  resume_from_checkpoint?: string;
  scoped_target?: AiScopedTarget;
  triggered_by?: string;
}

export interface AgentLog {
  level: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface AiTaskProgressEvent {
  correlation_id: string;
  session_id: string;
  org_id: string;
  pipeline_execution_id: string;
  agent_execution_id: string;
  agent_type: string;
  agent_name: string;
  status: string;
  order_index: number;
  progress_pct: number;
  confidence_input?: number;
  confidence_output?: number;
  llm_calls_delta?: number;
  tokens_delta?: number;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
  log?: AgentLog;
}

export interface AiTaskResultEvent {
  correlation_id: string;
  session_id: string;
  org_id: string;
  pipeline_execution_id: string;
  workflow_json?: Record<string, unknown>;
  elsa_json?: Record<string, unknown>;
  confidence: number;
  summary?: string;
  version_number?: number;
  source?: 'ai' | 'user' | 'comment_injection' | 'reconciliation';
}

export interface AiTaskDivergenceEvent {
  correlation_id: string;
  report_id: string;
  graph_a_id: string;
  graph_b_id: string;
  comparison_type: string;
  session_id: string;
}

export interface AiContextLoadEvent {
  correlation_id: string;
  session_id: string;
  org_id: string;
  active_rules: Record<string, unknown>[];
  skill_ids: string[];
}