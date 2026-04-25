import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { Workflow } from '../entities/workflow.entity';

interface ShareOptions {
  workflowId: string;
  expiresIn?: '1d' | '7d' | 'never';
  maxViews?: number;
}

interface ShareResult {
  token: string;
  url: string;
  expiresAt?: Date;
  maxViews?: number;
}

@Injectable()
export class ShareWorkflowService {
  constructor(
    @InjectRepository(Workflow)
    private workflowRepository: Repository<Workflow>,
  ) {}

  async createShare(options: ShareOptions): Promise<ShareResult> {
    const { workflowId, expiresIn = 'never', maxViews } = options;
    const token = randomBytes(16).toString('hex');
    
    let expiresAt: Date | undefined;
    if (expiresIn === '1d') {
      expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    } else if (expiresIn === '7d') {
      expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }

    await this.workflowRepository.update(workflowId, {
      shareToken: token,
      shareExpiresAt: expiresAt,
      shareMaxViews: maxViews,
      shareViewCount: 0,
    });

    return {
      token,
      url: `/workflows/shared/${token}`,
      expiresAt,
      maxViews,
    };
  }

  async getSharedWorkflow(token: string): Promise<Workflow | null> {
    const workflow = await this.workflowRepository.findOne({
      where: { shareToken: token },
    });

    if (!workflow) return null;

    if (workflow.shareExpiresAt && new Date() > workflow.shareExpiresAt) {
      return null;
    }

    if (workflow.shareMaxViews && workflow.shareViewCount >= workflow.shareMaxViews) {
      return null;
    }

    await this.workflowRepository.increment(
      { id: workflow.id },
      'shareViewCount',
      1
    );

    return workflow;
  }
}
