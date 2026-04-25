import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { NatsModule } from '../../infra/nats/nats.module';
import { Session } from '../sessions/entities/session.entity';
import { Workflow } from '../workflows/entities/workflow.entity';
import { PipelineExecution } from '../agents/entities/pipeline-execution.entity';
import { Document } from '../documents/entities/document.entity';
import { RealtimeGateway } from './realtime.gateway';
import { WsRoomGuardService } from './services/ws-room-guard.service';
import { NatsWsBridgeService } from './services/nats-ws-bridge.service';
import { RealtimeEmitterService } from './services/realtime-emitter.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('jwt.accessSecret'),
      }),
    }),
    NatsModule,
    TypeOrmModule.forFeature([Session, Workflow, PipelineExecution, Document]),
  ],
  providers: [
    RealtimeGateway,
    WsRoomGuardService,
    NatsWsBridgeService,
    RealtimeEmitterService,
  ],
  exports: [RealtimeGateway, RealtimeEmitterService],
})
export class RealtimeModule {}
