import { Controller, Post, Get, Param, Body, NotFoundException } from '@nestjs/common';
import { ShareWorkflowService } from '../services/share-workflow.service';

@Controller()
export class ShareWorkflowController {
  constructor(private shareService: ShareWorkflowService) {}

  @Post('workflows/:id/share')
  async createShare(
    @Param('id') workflowId: string,
    @Body() body: { expiresIn?: '1d' | '7d' | 'never'; maxViews?: number },
  ) {
    return this.shareService.createShare({ workflowId, ...body });
  }

  @Get('workflows/shared/:token')
  async getSharedWorkflow(@Param('token') token: string) {
    const workflow = await this.shareService.getSharedWorkflow(token);
    if (!workflow) {
      throw new NotFoundException('Shared workflow not found or expired');
    }
    
    // In a real scenario, you'd want to load the elementsJson from somewhere (e.g. session or another entity)
    // Assuming we just return the workflow basics here
    return {
      id: workflow.id,
      title: workflow.title,
      // elementsJson: workflow.elementsJson, // If it exists
    };
  }
}
