import { Module } from '@nestjs/common';
import { LoggerModule } from './logger/logger.module';
import { RequestContextService } from './context/request-context.service';

@Module({
  imports: [LoggerModule],
  providers: [RequestContextService],
  exports: [LoggerModule, RequestContextService],
})
export class CoreModule {}
