import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

interface HealthCheckResponse {
  status: 'up' | 'down';
  details: {
    pgvector: {
      status: string;
      latency_ms: number;
      installed?: boolean;
      version?: string;
      error?: string;
    };
  };
}

@Injectable()
export class PgVectorHealthIndicator {
  private readonly logger = new Logger(PgVectorHealthIndicator.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async check(): Promise<HealthCheckResponse> {
    const start = Date.now();
    try {
      const result = await this.dataSource.query(
        "SELECT extversion FROM pg_extension WHERE extname='vector'"
      );
      const latencyMs = Date.now() - start;
      const version = result[0]?.extversion || null;

      return {
        status: 'up',
        details: {
          pgvector: {
            status: latencyMs > 500 ? 'degraded' : 'up',
            latency_ms: latencyMs,
            installed: !!version,
            version,
          },
        },
      };
    } catch (error) {
      const latencyMs = Date.now() - start;
      this.logger.error(`pgvector health check failed: ${(error as Error).message}`);
      return {
        status: 'down',
        details: {
          pgvector: {
            status: 'down',
            latency_ms: latencyMs,
            installed: false,
            error: (error as Error).message,
          },
        },
      };
    }
  }
}