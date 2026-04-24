import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes, createHash } from 'crypto';
import { Repository } from 'typeorm';

import { ActorType, UserRole } from '../../database/enums';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { User } from '../auth/entities/user.entity';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { OrganizationMailerService } from './organization-mailer.service';
import { RequestUser } from './types/request-user.type';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokensRepository: Repository<RefreshToken>,
    @InjectRepository(AuditLog)
    private readonly auditLogsRepository: Repository<AuditLog>,
    private readonly mailer: OrganizationMailerService,
  ) {}

  async inviteUser(dto: InviteUserDto, caller: RequestUser) {
    this.assertAdmin(caller);

    const email = dto.email.toLowerCase();
    const existing = await this.usersRepository.findOne({ where: { email } });
    if (existing) throw new ConflictException('User already exists');

    const inviteToken = randomBytes(32).toString('hex');
    const inviteTokenHash = this.sha256(inviteToken);
    const inviteExpiresAt = new Date(Date.now() + INVITE_TTL_MS);
    const user = this.usersRepository.create({
      email,
      passwordHash: `pending-invite:${inviteTokenHash}`,
      role: dto.role ?? UserRole.VIEWER,
      orgId: caller.orgId,
      isVerified: false,
      isActive: true,
      inviteTokenHash,
      inviteExpiresAt,
      lockedUntil: null,
    });

    const saved = await this.usersRepository.save(user);
    await this.mailer.sendInvite(email, inviteToken);
    await this.auditLogsRepository.insert({
      actorId: caller.id,
      actorType: ActorType.USER,
      eventType: 'ORG_USER_INVITED',
      beforeState: null,
      afterState: {
        user_id: saved.id,
        email: saved.email,
        role: saved.role,
        org_id: saved.orgId,
      },
    });

    return {
      id: saved.id,
      email: saved.email,
      role: saved.role,
      orgId: saved.orgId,
      inviteExpiresAt,
      inviteToken: process.env.NODE_ENV === 'production' ? undefined : inviteToken,
    };
  }

  async updateUserRole(userId: string, dto: UpdateUserRoleDto, caller: RequestUser) {
    this.assertAdmin(caller);

    const user = await this.findOrgUserOrThrow(userId, caller.orgId);
    if (user.role === dto.role) return this.serializeUser(user);

    if (user.role === UserRole.ADMIN && dto.role !== UserRole.ADMIN) {
      await this.assertNotLastActiveAdmin(user.id, caller.orgId);
    }

    const beforeState = { user_id: user.id, role: user.role };
    user.role = dto.role;
    const saved = await this.usersRepository.save(user);

    await this.auditLogsRepository.insert({
      actorId: caller.id,
      actorType: ActorType.USER,
      eventType: 'ORG_USER_ROLE_UPDATED',
      beforeState,
      afterState: { user_id: saved.id, role: saved.role },
    });

    return this.serializeUser(saved);
  }

  async revokeUser(userId: string, caller: RequestUser) {
    this.assertAdmin(caller);

    const user = await this.findOrgUserOrThrow(userId, caller.orgId);
    if (user.role === UserRole.ADMIN) {
      await this.assertNotLastActiveAdmin(user.id, caller.orgId);
    }

    user.isActive = false;
    await this.usersRepository.save(user);
    await this.refreshTokensRepository.update({ userId: user.id }, { revoked: true });
    await this.auditLogsRepository.insert({
      actorId: caller.id,
      actorType: ActorType.USER,
      eventType: 'ORG_USER_REVOKED',
      beforeState: { user_id: user.id, is_active: true },
      afterState: { user_id: user.id, is_active: false },
    });

    return { revoked: true };
  }

  private async findOrgUserOrThrow(userId: string, orgId: string): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id: userId, orgId },
    });

    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private async assertNotLastActiveAdmin(userId: string, orgId: string): Promise<void> {
    const activeAdminCount = await this.usersRepository.count({
      where: { orgId, role: UserRole.ADMIN, isActive: true },
    });
    if (activeAdminCount <= 1) {
      const user = await this.usersRepository.findOne({ where: { id: userId, orgId } });
      if (user?.role === UserRole.ADMIN) {
        throw new BadRequestException('Cannot downgrade or revoke the last active admin');
      }
    }
  }

  private assertAdmin(caller: RequestUser): void {
    if (!caller?.orgId) throw new ForbiddenException('Organization scope is required');
    if (caller.role !== UserRole.ADMIN) throw new ForbiddenException('Admin role is required');
  }

  private sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private serializeUser(user: User) {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      orgId: user.orgId,
      isActive: user.isActive,
      isVerified: user.isVerified,
    };
  }
}
