import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class OrganizationMailerService {
  private readonly logger = new Logger(OrganizationMailerService.name);

  async sendInvite(email: string, inviteToken: string): Promise<void> {
    this.logger.log({
      msg: 'organization invite generated',
      email,
      inviteTokenPreview: `${inviteToken.slice(0, 8)}...`,
    });
  }
}
