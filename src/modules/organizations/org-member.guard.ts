import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from '../auth/entities/user.entity';
import { RequestUser } from './types/request-user.type';

@Injectable()
export class OrgMemberGuard implements CanActivate {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const caller = request.user as RequestUser | undefined;
    const targetUserId = request.params?.id;

    if (!caller?.orgId) throw new ForbiddenException('Organization scope is required');
    if (!targetUserId) return true;

    const target = await this.usersRepository.findOne({
      where: { id: targetUserId },
      select: ['id', 'orgId'],
    });

    if (!target || target.orgId !== caller.orgId) {
      throw new NotFoundException('User not found');
    }

    return true;
  }
}
