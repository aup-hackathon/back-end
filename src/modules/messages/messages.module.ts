import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Session } from '../sessions/entities/session.entity';
import { Workflow } from '../workflows/entities/workflow.entity';
import { MessagesController } from './controllers/messages.controller';
import { SessionMessagesController } from './controllers/session-messages.controller';
import { Message } from './entities';
import { MessagesService } from './services/messages.service';

@Module({
  imports: [TypeOrmModule.forFeature([Message, Session, Workflow])],
  controllers: [MessagesController, SessionMessagesController],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
