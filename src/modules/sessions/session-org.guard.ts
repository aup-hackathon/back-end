import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Workflow } from '../workflows/entities/workflow.entity';
import { Session } from './entities/session.entity';

type RequestUser = {
  id: string;
  orgId: string;
  role: string;
};

@Injectable()
export class SessionOrgGuard implements CanActivate {
  constructor(
    @InjectRepository(Session)
    private readonly sessionsRepository: Repository<Session>,
    @InjectRepository(Workflow)
    private readonly workflowsRepository: Repository<Workflow>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const caller = request.user as RequestUser | undefined;
    const sessionId = request.params?.id;

    if (!caller?.orgId) throw new ForbiddenException('Organization scope is required');
    if (!sessionId) return true;

    if (!require('class-validator').isUUID(sessionId)) {
      throw new require('@nestjs/common').BadRequestException('Validation failed (uuid is expected)');
    }

    const session = await this.sessionsRepository.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');

    const workflow = await this.workflowsRepository.findOne({
      where: { id: session.workflowId, orgId: caller.orgId },
      select: ['id'],
    });
    if (!workflow) throw new NotFoundException('Session not found');

    request.session = session;
    return true;
  }
}
