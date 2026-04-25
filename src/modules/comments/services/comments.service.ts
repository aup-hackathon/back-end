import { Injectable, NotFoundException, ForbiddenException, UnauthorizedException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import { CommentType, UserRole, PipelineTaskType, ActorType, MessageRole, MessageType, WorkflowStatus, PipelineStatus, SessionMode, SessionStatus } from '../../../database/enums';
import { Comment } from '../entities/comment.entity';
import { Workflow } from '../../workflows/entities/workflow.entity';
import { AuditService } from '../../audit/audit.service';
import { User } from '../../auth/entities/user.entity';
import { Message } from '../../messages/entities/message.entity';
import { Session } from '../../sessions/entities/session.entity';
import { PipelineExecution } from '../../agents/entities/pipeline-execution.entity';
import { NatsPublisherService } from '../../../infra/nats/nats.publisher.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import {
  CreateCommentDto,
  UpdateCommentDto,
  ResolveCommentDto,
  CreateReplyDto,
  AssignCommentDto,
  InjectToAiDto,
  ListCommentsQueryDto,
} from '../dto/comment.dto';

@Injectable()
export class CommentsService {
  private readonly logger = new Logger(CommentsService.name);

  constructor(
    @InjectRepository(Comment)
    private readonly commentRepository: Repository<Comment>,
    @InjectRepository(Workflow)
    private readonly workflowRepository: Repository<Workflow>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    @InjectRepository(PipelineExecution)
    private readonly pipelineExecutionRepository: Repository<PipelineExecution>,
    private readonly natsPublisher: NatsPublisherService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly auditService: AuditService,
  ) { }

  async createComment(
    workflowId: string,
    dto: CreateCommentDto,
    authorId: string,
    authorRole: UserRole,
    orgId: string,
  ): Promise<Comment> {
    // Verify workflow exists and belongs to org
    const workflow = await this.workflowRepository.findOne({
      where: { id: workflowId, orgId },
    });
    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    // Security: Only Reviewer, Business Analyst, Process Owner, and Admin can create comments
    if (!this.canUserCreateComment(authorRole)) {
      throw new UnauthorizedException('User role cannot create comments');
    }

    const comment = this.commentRepository.create({
      workflowId,
      elementId: dto.element_id ?? null,
      authorId,
      type: dto.type,
      content: dto.content,
    });

    const savedComment = await this.commentRepository.save(comment);

    // Create audit log
    await this.logUserAudit({
      workflowId,
      actorId: authorId,
      eventType: 'COMMENT_CREATED',
      elementId: dto.element_id ?? null,
      afterState: { comment_id: savedComment.id, type: dto.type },
    });

    return savedComment;
  }

  async listComments(
    workflowId: string,
    orgId: string,
    query: ListCommentsQueryDto,
  ): Promise<{ comments: Comment[]; total: number }> {
    // Verify workflow exists and belongs to org
    const workflow = await this.workflowRepository.findOne({
      where: { id: workflowId, orgId },
    });
    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    const qb = this.commentRepository.createQueryBuilder('comment').where(
      'comment.workflow_id = :workflowId',
      { workflowId },
    );

    if (query.resolved) {
      qb.andWhere('comment.resolved = :resolved', { resolved: query.resolved === 'true' });
    }
    if (query.type) {
      qb.andWhere('comment.type = :type', { type: query.type });
    }
    if (query.element_id) {
      qb.andWhere('comment.element_id = :elementId', { elementId: query.element_id });
    }

    const [comments, total] = await qb.orderBy('comment.created_at', 'ASC').getManyAndCount();

    return { comments, total };
  }

  async updateComment(
    commentId: string,
    dto: UpdateCommentDto,
    userId: string,
    userRole: UserRole,
    orgId: string,
  ): Promise<Comment> {
    const comment = await this.findCommentWithWorkflow(commentId, orgId);

    // Only author or admin can edit
    if (comment.authorId !== userId && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Only comment author or admin can edit');
    }

    const oldContent = comment.content;
    comment.content = dto.content;
    const savedComment = await this.commentRepository.save(comment);

    await this.logUserAudit({
      workflowId: comment.workflowId,
      actorId: userId,
      eventType: 'COMMENT_UPDATED',
      elementId: comment.elementId,
      beforeState: { content: oldContent },
      afterState: { content: dto.content },
    });

    return savedComment;
  }

  async deleteComment(commentId: string, userId: string, userRole: UserRole, orgId: string): Promise<void> {
    const comment = await this.findCommentWithWorkflow(commentId, orgId);

    // Only author or admin can delete
    if (comment.authorId !== userId && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Only comment author or admin can delete');
    }

    // Soft delete - mark as resolved
    comment.resolved = true;
    comment.resolvedAt = new Date();
    comment.resolvedBy = userId;
    comment.resolutionNote = 'deleted';

    await this.commentRepository.save(comment);

    await this.logUserAudit({
      workflowId: comment.workflowId,
      actorId: userId,
      eventType: 'COMMENT_DELETED',
      elementId: comment.elementId,
    });
  }

  async createReply(
    commentId: string,
    dto: CreateReplyDto,
    authorId: string,
    authorRole: UserRole,
    userOrgId: string,
  ): Promise<Comment> {
    const parentComment = await this.findCommentWithWorkflow(commentId, userOrgId);

    // Verify role
    if (!this.canUserCreateComment(authorRole)) {
      throw new UnauthorizedException('User role cannot create comments');
    }

    const comment = this.commentRepository.create({
      workflowId: parentComment.workflowId,
      elementId: parentComment.elementId,
      authorId,
      type: parentComment.type,
      content: dto.content,
      parentId: parentComment.id,
    });

    const savedComment = await this.commentRepository.save(comment);

    await this.logUserAudit({
      workflowId: parentComment.workflowId,
      actorId: authorId,
      eventType: 'COMMENT_REPLY_CREATED',
      elementId: parentComment.elementId,
      beforeState: { parent_comment_id: parentComment.id },
      afterState: { reply_id: savedComment.id },
    });

    return savedComment;
  }

  async resolveComment(
    commentId: string,
    dto: ResolveCommentDto,
    userId: string,
    userOrgId: string,
  ): Promise<Comment> {
    const comment = await this.findCommentWithWorkflow(commentId, userOrgId);

    // Resolution requires non-empty resolution_note
    if (!dto.resolution_note || dto.resolution_note.trim().length === 0) {
      throw new ForbiddenException('Resolution note is required');
    }

    comment.resolved = true;
    comment.resolvedAt = new Date();
    comment.resolvedBy = userId;
    comment.resolutionNote = dto.resolution_note;

    const savedComment = await this.commentRepository.save(comment);

    await this.logUserAudit({
      workflowId: comment.workflowId,
      actorId: userId,
      eventType: 'COMMENT_RESOLVED',
      elementId: comment.elementId,
      beforeState: { resolved: false },
      afterState: { resolved: true, resolution_note: dto.resolution_note },
    });

    return savedComment;
  }

  async injectToAi(
    commentId: string,
    _dto: InjectToAiDto,
    userId: string,
    userRole: UserRole,
    orgId: string,
  ): Promise<{ success: boolean; pipelineExecutionId?: string }> {
    const comment = await this.findCommentWithWorkflow(commentId, orgId);

    // Security: only Business Analyst, Process Owner, and Admin can inject
    if (!this.canUserInjectToAi(userRole)) {
      throw new UnauthorizedException('User role cannot inject to AI');
    }

    // Find or create a session for this workflow
    let session: Session | null = await this.sessionRepository.findOne({
      where: { workflowId: comment.workflowId },
      relations: ['userId'],
    });

    if (!session) {
      // Need a user to create session - get the workflow owner
      const workflow = await this.workflowRepository.findOne({
        where: { id: comment.workflowId },
      });
      if (!workflow) {
        throw new NotFoundException('Workflow not found');
      }

      // Create a session for the workflow owner
      session = this.sessionRepository.create({
        workflowId: comment.workflowId,
        userId: workflow.ownerId,
        status: SessionStatus.CREATED,
        mode: SessionMode.AUTO,
        confidenceScore: 0,
      });
      session = await this.sessionRepository.save(session);
    }

    // Create PipelineExecution record
    const pipelineExecution = this.pipelineExecutionRepository.create({
      sessionId: session.id,
      taskType: PipelineTaskType.SCOPED_REPROCESS,
      mode: SessionMode.AUTO,
      status: PipelineStatus.PENDING,
      inputPayload: {
        comment_text: comment.content,
        target_element_id: comment.elementId,
      },
      retryCount: 0,
      lastCheckpointAgent: null,
      triggeredBy: userId,
      natsMessageId: null,
      startedAt: null,
      completedAt: null,
      totalDurationMs: null,
      totalLlmCalls: 0,
      totalTokensConsumed: 0,
      finalConfidence: null,
      errorSummary: null,
      archivedAt: null,
    });
    const savedExecution = await this.pipelineExecutionRepository.save(pipelineExecution);

    // Publish to NATS
    await this.natsPublisher.publishAiTaskNew({
      correlation_id: `comment-${commentId}`,
      session_id: session.id,
      org_id: orgId,
      task_type: PipelineTaskType.SCOPED_REPROCESS,
      mode: SessionMode.AUTO,
      input: {
        comment_text: comment.content,
        target_element_id: comment.elementId,
      },
      pipeline_execution_id: savedExecution.id,
      scoped_target: {
        comment_id: commentId,
        element_id: comment.elementId,
      },
      triggered_by: userId,
    });

    const natsMessageId = `comment-${commentId}:ai.tasks.new:${savedExecution.id}`;
    savedExecution.natsMessageId = natsMessageId;
    await this.pipelineExecutionRepository.save(savedExecution);

    // Record system_note message in session
    const systemMessage = this.messageRepository.create({
      sessionId: session.id,
      role: MessageRole.SYSTEM,
      type: MessageType.SYSTEM_NOTE,
      content: `AI task injected from comment ${commentId}: ${comment.content}`,
      metadata: { comment_id: commentId, task_type: 'SCOPED_REPROCESS', pipeline_execution_id: savedExecution.id },
    });
    await this.messageRepository.save(systemMessage);

    // Audit log
    await this.logUserAudit({
      workflowId: comment.workflowId,
      actorId: userId,
      eventType: 'COMMENT_INJECTED_TO_AI',
      elementId: comment.elementId,
      afterState: {
        comment_id: commentId,
        pipeline_execution_id: savedExecution.id,
        session_id: session.id,
      },
    });

    return { success: true, pipelineExecutionId: savedExecution.id };
  }

  async assignComment(
    commentId: string,
    dto: AssignCommentDto,
    userId: string,
    userRole: UserRole,
    orgId: string,
  ): Promise<Comment> {
    const comment = await this.findCommentWithWorkflow(commentId, orgId);

    // Verify user can assign (author, admin, or process owner)
    if (comment.authorId !== userId && userRole !== UserRole.ADMIN && userRole !== UserRole.PROCESS_OWNER) {
      throw new ForbiddenException('Only comment author, admin, or process owner can assign');
    }

    // Verify assignee exists and belongs to org
    const assignee = await this.userRepository.findOne({
      where: { id: dto.assignee_id, orgId },
    });
    if (!assignee) {
      throw new NotFoundException('Assignee not found in organization');
    }

    comment.assignedTo = dto.assignee_id;
    const savedComment = await this.commentRepository.save(comment);

    // Audit log
    await this.logUserAudit({
      workflowId: comment.workflowId,
      actorId: userId,
      eventType: 'COMMENT_ASSIGNED',
      elementId: comment.elementId,
      beforeState: { assigned_to: null },
      afterState: { assigned_to: dto.assignee_id },
    });

    // Emit WebSocket notification
    this.realtimeGateway.emitToSession(dto.assignee_id, 'notification.review_request', {
      comment_id: commentId,
      workflow_id: comment.workflowId,
    });

    return savedComment;
  }

  async getAssignedToMe(orgId: string, userId: string, resolved?: string): Promise<{ comments: Comment[] }> {
    const qb = this.commentRepository.createQueryBuilder('comment').where(
      'comment.assigned_to = :userId',
      { userId },
    );

    if (resolved) {
      qb.andWhere('comment.resolved = :resolved', { resolved: resolved === 'true' });
    }

    const comments = await qb.orderBy('comment.created_at', 'ASC').getMany();
    return { comments };
  }

  async getReviewProgress(workflowId: string, orgId: string): Promise<{
    approved_count: number;
    total_count: number;
    completion_pct: number;
  }> {
    const workflow = await this.workflowRepository.findOne({
      where: { id: workflowId, orgId },
    });
    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    // Get latest version elements - excluding archived elements
    // We need to load the latest version
    const latestVersion = await this.workflowRepository.query(
      `SELECT elements_json FROM workflow_version WHERE workflow_id = $1 ORDER BY version_number DESC LIMIT 1`,
      [workflowId],
    );

    let elements: Array<{ id: string; archived?: boolean; approved?: boolean }> = [];
    if (latestVersion.length > 0 && latestVersion[0].elements_json) {
      elements = latestVersion[0].elements_json as Array<{
        id: string;
        archived?: boolean;
        approved?: boolean;
      }>;
    }

    // Filter out archived elements
    const nonArchivedElements = elements.filter((el) => el.archived !== true);

    const totalCount = nonArchivedElements.length;
    const approvedCount = nonArchivedElements.filter((el) => el.approved === true).length;
    const completionPct = totalCount > 0 ? Math.round((approvedCount / totalCount) * 100) : 0;

    return {
      approved_count: approvedCount,
      total_count: totalCount,
      completion_pct: completionPct,
    };
  }

  async approveElement(
    workflowId: string,
    elementId: string,
    userId: string,
    userRole: UserRole,
    orgId: string,
  ): Promise<{ success: boolean }> {
    const workflow = await this.workflowRepository.findOne({
      where: { id: workflowId, orgId },
    });
    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    // Note: We update the latest workflow version with approved flag on element
    // Get current version
    const versionResult = await this.workflowRepository.query(
      `SELECT id, elements_json FROM workflow_version WHERE workflow_id = $1 ORDER BY version_number DESC LIMIT 1`,
      [workflowId],
    );

    if (versionResult.length === 0) {
      throw new NotFoundException('No version found for workflow');
    }

    const versionId = versionResult[0].id;
    const elementsJson = versionResult[0].elements_json as Array<Record<string, unknown>>;

    // Update element approval
    const updatedElements = elementsJson.map((el) => {
      if (el.id === elementId) {
        return { ...el, approved: true, approved_by: userId, approved_at: new Date().toISOString() };
      }
      return el;
    });

    // Update the version
    await this.workflowRepository.query(
      `UPDATE workflow_version SET elements_json = $1 WHERE id = $2`,
      [JSON.stringify(updatedElements), versionId],
    );

    // Audit log
    await this.logUserAudit({
      workflowId,
      actorId: userId,
      eventType: 'ELEMENT_APPROVED',
      elementId,
    });

    return { success: true };
  }

  async bulkApproveElements(
    workflowId: string,
    elementIds: string[] | undefined,
    userId: string,
    userRole: UserRole,
    orgId: string,
  ): Promise<{ approved_count: number }> {
    const workflow = await this.workflowRepository.findOne({
      where: { id: workflowId, orgId },
    });
    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    // Security: only Admin or Process Owner
    if (userRole !== UserRole.ADMIN && userRole !== UserRole.PROCESS_OWNER) {
      throw new ForbiddenException('Only Admin or Process Owner can bulk approve');
    }

    // Get current version
    const versionResult = await this.workflowRepository.query(
      `SELECT id, elements_json FROM workflow_version WHERE workflow_id = $1 ORDER BY version_number DESC LIMIT 1`,
      [workflowId],
    );

    if (versionResult.length === 0) {
      throw new NotFoundException('No version found for workflow');
    }

    const versionId = versionResult[0].id;
    let elementsJson = versionResult[0].elements_json as Array<Record<string, unknown>>;

    const now = new Date().toISOString();
    const approvedIds: string[] = [];

    // If no elementIds provided, approve all unapproved elements
    const targetIds = elementIds ?? elementsJson.filter((el) => el.approved !== true).map((el) => el.id as string);

    // Update elements
    elementsJson = elementsJson.map((el) => {
      if (targetIds.includes(el.id as string)) {
        approvedIds.push(el.id as string);
        return { ...el, approved: true, approved_by: userId, approved_at: now };
      }
      return el;
    });

    // Update the version
    await this.workflowRepository.query(
      `UPDATE workflow_version SET elements_json = $1 WHERE id = $2`,
      [JSON.stringify(elementsJson), versionId],
    );

    // Single audit log entry
    await this.logUserAudit({
      workflowId,
      actorId: userId,
      eventType: 'ELEMENTS_BULK_APPROVED',
      afterState: { element_ids: approvedIds },
    });

    return { approved_count: approvedIds.length };
  }

  async triggerReviewerNotification(workflowId: string): Promise<void> {
    const workflow = await this.workflowRepository.findOne({
      where: { id: workflowId },
    });
    if (!workflow) return;

    // Only trigger on PENDING_REVIEW transition
    if (workflow.status !== WorkflowStatus.PENDING_REVIEW) return;

    // Find comments with assigned_to in this workflow
    const assignedComments = await this.commentRepository.find({
      where: { workflowId },
    });
    const assignedUsers = assignedComments
      .filter((c) => c.assignedTo)
      .map((c) => c.assignedTo as string);

    // Get unique users including reviewers on the workflow
    const uniqueUserIds = [...new Set(assignedUsers)];

    // Get user emails and emit notifications
    for (const userId of uniqueUserIds) {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (user) {
        // Dev email log
        console.log(
          `[email-dev] reviewer-notification-to: ${user.email} body: Workflow "${workflow.title}" is pending review. Please review your assigned comments.`,
        );

        // WebSocket fallback
        this.realtimeGateway.emitToSession(userId, 'notification.review_request', {
          workflow_id: workflowId,
          workflow_title: workflow.title,
        });
      }
    }
  }

  private async findCommentWithWorkflow(commentId: string, orgId: string): Promise<Comment> {
    const comment = await this.commentRepository.findOne({
      where: { id: commentId },
    });
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    // Verify workflow belongs to org
    const workflow = await this.workflowRepository.findOne({
      where: { id: comment.workflowId, orgId },
    });
    if (!workflow) {
      throw new NotFoundException('Comment not found in organization');
    }

    return comment;
  }

  private canUserCreateComment(role: UserRole): boolean {
    return (
      role === UserRole.REVIEWER ||
      role === UserRole.BUSINESS_ANALYST ||
      role === UserRole.PROCESS_OWNER ||
      role === UserRole.ADMIN
    );
  }

  private canUserInjectToAi(role: UserRole): boolean {
    return (
      role === UserRole.BUSINESS_ANALYST || role === UserRole.PROCESS_OWNER || role === UserRole.ADMIN
    );
  }

  private logUserAudit(entry: {
    workflowId: string;
    actorId: string;
    eventType: string;
    elementId?: string | null;
    beforeState?: Record<string, unknown> | null;
    afterState?: Record<string, unknown> | null;
  }) {
    return this.auditService.log({
      workflowId: entry.workflowId,
      actorId: entry.actorId,
      actorType: ActorType.USER,
      eventType: entry.eventType,
      elementId: entry.elementId ?? null,
      beforeState: entry.beforeState ?? null,
      afterState: entry.afterState ?? null,
    });
  }
}
