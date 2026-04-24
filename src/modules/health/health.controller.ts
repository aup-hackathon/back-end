import { Controller, Get, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { Public } from '../../core/decorators/public.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { HealthService } from './health.service';
import { HealthCheckResponse, HealthStatus } from './dto/health.dto';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  async check(): Promise<HealthCheckResponse> {
    return this.healthService.checkHealth();
  }

  @Roles('Admin')
  @Get('details')
  @HttpCode(HttpStatus.OK)
  async checkDetails(): Promise<HealthCheckResponse> {
    return this.healthService.checkHealthDetails();
  }

  @Roles('Admin')
  @Get('ai-service')
  @HttpCode(HttpStatus.OK)
  async checkAiService() {
    return this.healthService.checkAiService();
  }

  @Roles('Admin')
  @Get('ollama')
  @HttpCode(HttpStatus.OK)
  async checkOllama() {
    return this.healthService.checkOllama();
  }

  @Roles('Admin')
  @Get('pgvector')
  @HttpCode(HttpStatus.OK)
  async checkPgVector() {
    return this.healthService.checkPgVector();
  }

  @Roles('Admin')
  @Get('nats')
  @HttpCode(HttpStatus.OK)
  async checkNatsStats() {
    return this.healthService.checkNatsStats();
  }

  @Public()
  @Get('ping')
  ping() {
    return { pong: true };
  }
}