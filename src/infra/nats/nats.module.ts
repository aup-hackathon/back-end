import { Module } from '@nestjs/common';

import { NatsClientService } from './nats.client';
import { NatsPublisherService } from './nats.publisher.service';

@Module({
  providers: [NatsClientService, NatsPublisherService],
  exports: [NatsClientService, NatsPublisherService],
})
export class NatsModule {}