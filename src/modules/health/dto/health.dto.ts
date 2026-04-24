export interface HealthStatus {
  status: 'ok' | 'degraded' | 'down';
  latency_ms?: number;
  error?: string;
  version?: string;
  jetstream?: boolean;
  models_loaded?: number;
  installed?: boolean;
  [key: string]: unknown;
}

export interface HealthCheckResponse {
  status: 'ok' | 'degraded' | 'down';
  services: Record<string, HealthStatus>;
  timestamp: string;
  ping_timestamp?: string;
}