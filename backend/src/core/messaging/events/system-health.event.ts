export type ServiceName = 'nestjs' | 'fastapi' | 'ollama' | 'elsa' | 'postgres' | 'nats' | 'minio';
export type ServiceStatus = 'ok' | 'degraded' | 'down';

export interface SystemHealthPingEvent {
  service: ServiceName;
  status: ServiceStatus;
  latency_ms?: number;
  details?: Record<string, unknown>;
  timestamp: string;
}