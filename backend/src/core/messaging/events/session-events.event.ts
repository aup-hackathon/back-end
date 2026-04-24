export interface SessionFinalizedEvent {
  session_id: string;
  workflow_id: string;
  final_version_number: number;
  final_confidence: number;
  finalized_at: string;
}