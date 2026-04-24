import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Comment } from './entities/comment.entity';
import { Workflow } from '../workflows/entities/workflow.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { User } from '../auth/entities/user.entity';
import { Message } from '../messages/entities/message.entity';
import { Session } from '../sessions/entities/session.entity';
import { PipelineExecution } from '../agents/entities/pipeline-execution.entity';
import { CommentsService } from './services/comments.service';
import { CommentsController, CommentOperationsController, CommentsAssignedController, ElementReviewController, ReviewProgressController } from './controllers/comments.controller';
import { NatsModule } from '../../infra/nats/nats.module';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([Comment, Workflow, AuditLog, User, Message, Session, PipelineExecution]),
    NatsModule,
  ],
  controllers: [
    CommentsController,
    CommentOperationsController,
    CommentsAssignedController,
    ElementReviewController,
    ReviewProgressController,
  ],
  providers: [CommentsService, RealtimeGateway],
  exports: [CommentsService],
})
export class CommentsModule { }