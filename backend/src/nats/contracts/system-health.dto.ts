import { IsIn, IsNumber, IsObject, IsOptional, IsString } from 'class-validator';

export class SystemHealthPingPayload {
  @IsIn(['nestjs', 'fastapi', 'ollama', 'elsa', 'postgres', 'nats', 'minio'])
  service: 'nestjs' | 'fastapi' | 'ollama' | 'elsa' | 'postgres' | 'nats' | 'minio';

  @IsIn(['ok', 'degraded', 'down'])
  status: 'ok' | 'degraded' | 'down';

  @IsOptional()
  @IsNumber()
  latency_ms?: number;

  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;

  @IsString()
  timestamp: string;
}
