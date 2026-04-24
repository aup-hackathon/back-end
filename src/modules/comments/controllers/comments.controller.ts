import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBearerAuth, ApiBody } from '@nestjs/swagger';

import { CommentsService } from '../services/comments.service';
import {
  CreateCommentDto,
  UpdateCommentDto,
  ResolveCommentDto,
  CreateReplyDto,
  AssignCommentDto,
  InjectToAiDto,
  ListCommentsQueryDto,
} from '../dto/comment.dto';
import { CommentType } from '../../../database/enums';

interface AuthenticatedRequest extends Request {
  user: { id: string; orgId: string; role: string };
}

@ApiBearerAuth()
@ApiTags('Comments')
@Controller('workflows/:workflowId/comments')
@UseGuards(AuthGuard('jwt'))
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a comment on a workflow' })
  @ApiParam({ name: 'workflowId', description: 'UUID of the workflow' })
  @ApiBody({ type: CreateCommentDto })
  @ApiResponse({ status: 201, description: 'Comment created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - invalid role' })
  @ApiResponse({ status: 404, description: 'Workflow not found' })
  async create(
    @Param('workflowId', ParseUUIDPipe) workflowId: string,
    @Body() dto: CreateCommentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const comment = await this.commentsService.createComment(
      workflowId,
      dto,
      req.user.id,
      req.user.role as any,
      req.user.orgId,
    );
    return { comment };
  }

  @Get()
  @ApiOperation({ summary: 'List all comments for a workflow' })
  @ApiParam({ name: 'workflowId', description: 'UUID of the workflow' })
  @ApiQuery({ name: 'resolved', required: false, enum: ['true', 'false'] })
  @ApiQuery({ name: 'type', required: false, enum: CommentType })
  @ApiQuery({ name: 'element_id', required: false, description: 'Filter by element ID' })
  @ApiResponse({ status: 200, description: 'Comments retrieved successfully' })
  async list(
    @Param('workflowId', ParseUUIDPipe) workflowId: string,
    @Query() query: ListCommentsQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const { comments, total } = await this.commentsService.listComments(
      workflowId,
      req.user.orgId,
      query,
    );
    return { comments, total };
  }
}

@ApiBearerAuth()
@ApiTags('Comments')
@Controller('comments')
@UseGuards(AuthGuard('jwt'))
export class CommentOperationsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Patch(':id')
  @ApiOperation({ summary: 'Update a comment (author or admin only)' })
  @ApiParam({ name: 'id', description: 'UUID of the comment' })
  @ApiBody({ type: UpdateCommentDto })
  @ApiResponse({ status: 200, description: 'Comment updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - not author or admin' })
  @ApiResponse({ status: 404, description: 'Comment not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCommentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const comment = await this.commentsService.updateComment(
      id,
      dto,
      req.user.id,
      req.user.role as any,
      req.user.orgId,
    );
    return { comment };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete a comment (author or admin only)' })
  @ApiParam({ name: 'id', description: 'UUID of the comment' })
  @ApiResponse({ status: 204, description: 'Comment deleted successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - not author or admin' })
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.commentsService.deleteComment(id, req.user.id, req.user.role as any, req.user.orgId);
  }

  @Post(':id/reply')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a threaded reply to a comment' })
  @ApiParam({ name: 'id', description: 'UUID of the parent comment' })
  @ApiBody({ type: CreateReplyDto })
  @ApiResponse({ status: 201, description: 'Reply created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - invalid role' })
  async reply(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateReplyDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const comment = await this.commentsService.createReply(
      id,
      dto,
      req.user.id,
      req.user.role as any,
      req.user.orgId,
    );
    return { comment };
  }

  @Post(':id/resolve')
  @ApiOperation({ summary: 'Mark a comment as resolved' })
  @ApiParam({ name: 'id', description: 'UUID of the comment' })
  @ApiBody({ type: ResolveCommentDto })
  @ApiResponse({ status: 200, description: 'Comment resolved successfully' })
  @ApiResponse({ status: 400, description: 'Resolution note is required' })
  async resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveCommentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const comment = await this.commentsService.resolveComment(
      id,
      dto,
      req.user.id,
      req.user.orgId,
    );
    return { comment };
  }

  @Post(':id/inject-to-ai')
  @ApiOperation({ summary: 'Inject comment to AI for processing (BA, Process Owner, Admin only)' })
  @ApiParam({ name: 'id', description: 'UUID of the comment' })
  @ApiBody({ type: InjectToAiDto })
  @ApiResponse({ status: 200, description: 'AI task injected successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - invalid role' })
  async injectToAi(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InjectToAiDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const result = await this.commentsService.injectToAi(
      id,
      dto,
      req.user.id,
      req.user.role as any,
      req.user.orgId,
    );
    return result;
  }

  @Patch(':id/assign')
  @ApiOperation({ summary: 'Assign a comment to a user for resolution' })
  @ApiParam({ name: 'id', description: 'UUID of the comment' })
  @ApiBody({ type: AssignCommentDto })
  @ApiResponse({ status: 200, description: 'Comment assigned successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - not author, admin, or process owner' })
  @ApiResponse({ status: 404, description: 'Assignee not found in organization' })
  async assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignCommentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const comment = await this.commentsService.assignComment(
      id,
      dto,
      req.user.id,
      req.user.role as any,
      req.user.orgId,
    );
    return { comment };
  }
}

@ApiBearerAuth()
@ApiTags('Comments')
@Controller('comments')
@UseGuards(AuthGuard('jwt'))
export class CommentsAssignedController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get('assigned-to-me')
  @ApiOperation({ summary: 'Get comments assigned to the current user' })
  @ApiQuery({ name: 'resolved', required: false, enum: ['true', 'false'] })
  @ApiResponse({ status: 200, description: 'Comments retrieved successfully' })
  async getAssignedToMe(
    @Query('resolved') resolved: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    const result = await this.commentsService.getAssignedToMe(
      req.user.orgId,
      req.user.id,
      resolved,
    );
    return result;
  }
}

@ApiBearerAuth()
@ApiTags('Element Review')
@Controller('workflows/:workflowId/elements')
@UseGuards(AuthGuard('jwt'))
export class ElementReviewController {
  constructor(private readonly commentsService: CommentsService) {}

  @Patch(':elemId/approve')
  @ApiOperation({ summary: 'Approve a workflow element' })
  @ApiParam({ name: 'workflowId', description: 'UUID of the workflow' })
  @ApiParam({ name: 'elemId', description: 'ID of the element' })
  @ApiResponse({ status: 200, description: 'Element approved successfully' })
  @ApiResponse({ status: 404, description: 'Workflow or element not found' })
  async approveElement(
    @Param('workflowId', ParseUUIDPipe) workflowId: string,
    @Param('elemId') elemId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const result = await this.commentsService.approveElement(
      workflowId,
      elemId,
      req.user.id,
      req.user.role as any,
      req.user.orgId,
    );
    return result;
  }

  @Post('approve-all')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Bulk approve workflow elements (Admin or Process Owner only)' })
  @ApiParam({ name: 'workflowId', description: 'UUID of the workflow' })
  @ApiResponse({ status: 201, description: 'Elements approved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - not Admin or Process Owner' })
  async bulkApprove(
    @Param('workflowId', ParseUUIDPipe) workflowId: string,
    @Body() body: { element_ids?: string[] },
    @Req() req: AuthenticatedRequest,
  ) {
    const result = await this.commentsService.bulkApproveElements(
      workflowId,
      body.element_ids,
      req.user.id,
      req.user.role as any,
      req.user.orgId,
    );
    return result;
  }
}

@ApiBearerAuth()
@ApiTags('Review Progress')
@Controller('workflows/:workflowId')
@UseGuards(AuthGuard('jwt'))
export class ReviewProgressController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get('review-progress')
  @ApiOperation({ summary: 'Get review progress for a workflow (excludes archived elements)' })
  @ApiParam({ name: 'workflowId', description: 'UUID of the workflow' })
  @ApiResponse({ status: 200, description: 'Review progress retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Workflow not found' })
  async getReviewProgress(
    @Param('workflowId', ParseUUIDPipe) workflowId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.commentsService.getReviewProgress(workflowId, req.user.orgId);
  }
}