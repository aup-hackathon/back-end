export interface PipelineDivergenceResultEvent {
  correlation_id: string;
  report_id: string;
  session_id: string;
  similarity_score: number;
  status?: string;
}