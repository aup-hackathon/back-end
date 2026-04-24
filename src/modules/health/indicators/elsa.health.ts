import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

interface HealthCheckResponse {
  status: 'up' | 'down';
  details: {
    elsa: {
      status: string;
      latency_ms: number;
      error?: string;
    };
  };
}

@Injectable()
export class ElsaHealthIndicator {
  private readonly logger = new Logger(ElsaHealthIndicator.name);

  constructor(private readonly configService: ConfigService) {}

  async check(): Promise<HealthCheckResponse> {
    const start = Date.now();
    const url = this.configService.get<string>('health.elsa');
    
    try {
      const response = await axios.get(`${url}/health`, { timeout: 5000 });
      const latencyMs = Date.now() - start;

      return {
        status: 'up',
        details: {
          elsa: {
            status: latencyMs > 500 ? 'degraded' : 'up',
            latency_ms: latencyMs,
          },
        },
      };
    } catch (error) {
      const latencyMs = Date.now() - start;
      this.logger.error(`Elsa health check failed: ${(error as Error).message}`);
      return {
        status: 'down',
        details: {
          elsa: {
            status: 'down',
            latency_ms: latencyMs,
            error: (error as Error).message,
          },
        },
      };
    }
  }
}