import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';

interface HealthCheckResponse {
  status: 'up' | 'down';
  details: {
    minio: {
      status: string;
      latency_ms: number;
      error?: string;
    };
  };
}

@Injectable()
export class MinIOHealthIndicator {
  private readonly logger = new Logger(MinIOHealthIndicator.name);
  private readonly minioClient: Client;

  constructor(private readonly configService: ConfigService) {
    const endpoint = this.configService.get<string>('minio.endpoint');
    const port = this.configService.get<number>('minio.port') || 9000;
    const useSSL = this.configService.get<boolean>('minio.useSsl') || false;
    const accessKey = this.configService.get<string>('minio.accessKey');
    const secretKey = this.configService.get<string>('minio.secretKey');

    this.minioClient = new Client({
      endPoint: endpoint || 'localhost',
      port,
      useSSL,
      accessKey,
      secretKey,
    });
  }

  async check(): Promise<HealthCheckResponse> {
    const start = Date.now();
    try {
      await this.minioClient.listBuckets();
      const latencyMs = Date.now() - start;

      return {
        status: 'up',
        details: {
          minio: {
            status: latencyMs > 500 ? 'degraded' : 'up',
            latency_ms: latencyMs,
          },
        },
      };
    } catch (error) {
      const latencyMs = Date.now() - start;
      this.logger.error(`MinIO health check failed: ${(error as Error).message}`);
      return {
        status: 'down',
        details: {
          minio: {
            status: 'down',
            latency_ms: latencyMs,
            error: (error as Error).message,
          },
        },
      };
    }
  }
}