import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { RequestContextService } from './core/context/request-context.service';
import { HttpExceptionFilter } from './core/filters/http-exception.filter';
import { CorrelationIdInterceptor } from './core/interceptors/correlation-id.interceptor';
import { LoggingInterceptor } from './core/interceptors/logging.interceptor';
import { WsJwtAuthAdapter } from './modules/realtime/adapters/ws-jwt-auth.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);

  // Apply custom WebSocket adapter with JWT authentication on handshake
  app.useWebSocketAdapter(new WsJwtAuthAdapter(app));

  if (process.env.NODE_ENV === 'production' && process.env.DEV_BYPASS_AUTH === 'true') {
    logger.error('DEV_BYPASS_AUTH=true is not allowed in production');
    throw new Error('Refusing to boot with DEV_BYPASS_AUTH=true in production');
  }

  app.use(helmet({ crossOriginEmbedderPolicy: false }));
  app.use(cookieParser());

  const corsOrigin = process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3001'];
  if (process.env.NODE_ENV === 'production' && corsOrigin.includes('*')) {
    throw new Error('Wildcard CORS origin is not allowed in production');
  }
  app.enableCors({ origin: corsOrigin, credentials: true });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter(logger));
  app.useGlobalInterceptors(
    new CorrelationIdInterceptor(app.get(RequestContextService)),
    new LoggingInterceptor(logger),
  );

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('FlowForge API')
      .setDescription('The FlowForge REST API description')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  app.enableShutdownHooks();

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`Application is running on: http://localhost:${port}/api`);
}
bootstrap();
