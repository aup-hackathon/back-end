import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

interface HealthCheckResponse {
  status: 'up' | 'down';
  details: {
    ollama: {
      status: string;
      latency_ms: number;
      models_loaded?: number;
      error?: string;
    };
  };
}

@Injectable()
export class OllamaHealthIndicator {
  private readonly logger = new Logger(OllamaHealthIndicator.name);

  constructor(private readonly configService: ConfigService) {}

  async check(): Promise<HealthCheckResponse> {
    const start = Date.now();
    const url = this.configService.get<string>('ollama.url') || 'http://ollama:11434';
    
    try {
      const response = await axios.get(`${url}/api/tags`, { timeout: 5000 });
      const latencyMs = Date.now() - start;
      const models = response.data?.models || [];
      
      return {
        status: 'up',
        details: {
          ollama: {
            status: latencyMs > 500 ? 'degraded' : 'up',
            latency_ms: latencyMs,
            models_loaded: models.length,
          },
        },
      };
    } catch (error) {
      const latencyMs = Date.now() - start;
      this.logger.error(`Ollama health check failed: ${(error as Error).message}`);
      return {
        status: 'down',
        details: {
          ollama: {
            status: 'down',
            latency_ms: latencyMs,
            error: (error as Error).message,
          },
        },
      };
    }
  }
}