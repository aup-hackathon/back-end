import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

import configuration from './core/config/configuration';
import { envSchema } from './core/config/env.validation';
import { CoreModule } from './core/core.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envSchema,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        redact: [
          'req.headers.authorization',
          'req.headers.cookie',
          '*.password',
          '*.password_hash',
          '*.token',
        ],
      },
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.getOrThrow<number>('throttle.ttl'),
          limit: config.getOrThrow<number>('throttle.limit'),
        },
      ],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.getOrThrow<string>('database.url'),
        synchronize: false,
        migrationsRun: false,
        entities: [__dirname + '/modules/**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/database/migrations/*{.ts,.js}'],
        autoLoadEntities: false,
        namingStrategy: new SnakeNamingStrategy(),
      }),
    }),
    CoreModule,
    HealthModule,
  ],
})
export class AppModule {}
