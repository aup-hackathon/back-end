import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DeadLetter } from '../modules/agents/entities';
import { DlqService } from './dlq.service';
import { NatsClientService } from './nats.client';
import { NatsPublisherService } from './nats.publisher.service';

@Module({
  imports: [TypeOrmModule.forFeature([DeadLetter])],
  providers: [NatsClientService, NatsPublisherService, DlqService],
  exports: [NatsClientService, NatsPublisherService, DlqService],
})
export class NatsModule {}
