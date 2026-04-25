/**
 * Typed payload interfaces for every server → client WebSocket event.
 * These define the contract the front-end consumes.
 */

// ─── Pipeline / Agent ───────────────────────────────────────────────

export interface PipelineProgressPayload {
  session_id: string;
  pipeline_execution_id: string;
  agent_type: string;
  agent_name: string;
  status: string;
  order_index: number;
  progress_pct: number;
  confidence_output?: number;
}

export interface AgentLogPayload {
  agent_execution_id: string;
  log_level: string;
  message: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface AgentStatusPayload {
  agent_execution_id: string;
  status: string;
  duration_ms?: number;
  error_message?: string;
}

// ─── Workflow ───────────────────────────────────────────────────────

export interface WorkflowChangedElement {
  element_id: string;
  change_type: 'added' | 'removed' | 'modified';
}

export interface WorkflowUpdatedPayload {
  workflow_id: string;
  version_number: number;
  changed_elements: WorkflowChangedElement[];
  source: string;
  correlation_id: string;
}

// ─── Session ────────────────────────────────────────────────────────

export interface SessionStatePayload {
  session_id: string;
  status: string;
}

export interface SessionNeedsReconciliationPayload {
  session_id: string;
  report_id: string;
  similarity_score: number;
}

export interface SessionFinalizedPayload {
  session_id: string;
  workflow_id: string;
  final_version_number: number;
  final_confidence: number;
}

// ─── Document ───────────────────────────────────────────────────────

export interface DocumentReadyPayload {
  document_id: string;
  extracted_text_preview: string;
  confidence: number;
}

// ─── Collaboration ──────────────────────────────────────────────────

export interface CommentCreatedPayload {
  comment_id: string;
  workflow_id: string;
  element_id?: string;
  author_id: string;
  type: string;
}

export interface CommentResolvedPayload {
  comment_id: string;
  resolved_by: string;
  resolved_at: string;
}

// ─── Divergence ─────────────────────────────────────────────────────

export interface DivergenceReportReadyPayload {
  report_id: string;
  comparison_type: string;
  similarity_score: number;
  severity: string;
  total_points: number;
  critical_count: number;
}

export interface DivergenceReportUpdatedPayload {
  report_id: string;
  unresolved_points: number;
  resolved_points: number;
}

// ─── Rules / Skills ─────────────────────────────────────────────────

export interface RulesConflictDetectedPayload {
  rule_a_id: string;
  rule_b_id: string;
  scope: string;
  message: string;
}

export interface SkillsApplicationLoggedPayload {
  skill_id: string;
  agent_execution_id: string;
  similarity_score: number;
  injected_tokens: number;
}

// ─── System ─────────────────────────────────────────────────────────

export interface SystemHealthAlertPayload {
  component: string;
  status: string;
  since: string;
  details?: Record<string, unknown>;
}

// ─── Notifications ──────────────────────────────────────────────────

export interface NotificationReviewRequestPayload {
  comment_id: string;
  workflow_id: string;
  by_user_id: string;
}

// ─── Room join request ──────────────────────────────────────────────

export interface JoinRoomPayload {
  room: string;
}

export interface JoinErrorPayload {
  room: string;
  reason: string;
}
