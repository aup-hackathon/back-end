import { Injectable, Logger } from '@nestjs/common';

import { RealtimeGateway } from '../realtime.gateway';
import { WS_EVENTS } from '../constants/ws-events.constants';
import {
  SessionStatePayload,
  SessionNeedsReconciliationPayload,
  CommentCreatedPayload,
  CommentResolvedPayload,
  DivergenceReportReadyPayload,
  DivergenceReportUpdatedPayload,
  RulesConflictDetectedPayload,
  SkillsApplicationLoggedPayload,
  NotificationReviewRequestPayload,
} from '../interfaces/ws-payloads.interface';

/**
 * Internal event emitter for real-time events that originate inside NestJS
 * (not from NATS). Other modules inject this service to push events.
 */
@Injectable()
export class RealtimeEmitterService {
  private readonly logger = new Logger(RealtimeEmitterService.name);

  constructor(private readonly gateway: RealtimeGateway) {}

  // ─── Session ──────────────────────────────────────────────────────

  emitSessionState(sessionId: string, payload: SessionStatePayload): void {
    this.logger.debug(`Emitting session.state for session=${sessionId}`);
    this.gateway.emitToSession(
      sessionId,
      WS_EVENTS.SESSION_STATE,
      payload as unknown as Record<string, unknown>,
    );
  }

  emitSessionNeedsReconciliation(
    sessionId: string,
    payload: SessionNeedsReconciliationPayload,
  ): void {
    this.logger.debug(`Emitting session.needs_reconciliation for session=${sessionId}`);
    this.gateway.emitToSession(
      sessionId,
      WS_EVENTS.SESSION_NEEDS_RECONCILIATION,
      payload as unknown as Record<string, unknown>,
    );
  }

  // ─── Collaboration ────────────────────────────────────────────────

  emitCommentCreated(workflowId: string, payload: CommentCreatedPayload): void {
    this.logger.debug(`Emitting comment.created for workflow=${workflowId}`);
    this.gateway.emitToWorkflow(
      workflowId,
      WS_EVENTS.COMMENT_CREATED,
      payload as unknown as Record<string, unknown>,
    );
  }

  emitCommentResolved(workflowId: string, payload: CommentResolvedPayload): void {
    this.logger.debug(`Emitting comment.resolved for workflow=${workflowId}`);
    this.gateway.emitToWorkflow(
      workflowId,
      WS_EVENTS.COMMENT_RESOLVED,
      payload as unknown as Record<string, unknown>,
    );
  }

  // ─── Divergence ───────────────────────────────────────────────────

  emitDivergenceReportReady(
    workflowId: string,
    sessionId: string,
    payload: DivergenceReportReadyPayload,
  ): void {
    this.logger.debug(
      `Emitting divergence.report.ready for workflow=${workflowId} session=${sessionId}`,
    );
    this.gateway.emitToWorkflow(
      workflowId,
      WS_EVENTS.DIVERGENCE_REPORT_READY,
      payload as unknown as Record<string, unknown>,
    );
    this.gateway.emitToSession(
      sessionId,
      WS_EVENTS.DIVERGENCE_REPORT_READY,
      payload as unknown as Record<string, unknown>,
    );
  }

  emitDivergenceReportUpdated(
    workflowId: string,
    payload: DivergenceReportUpdatedPayload,
  ): void {
    this.logger.debug(`Emitting divergence.report.updated for workflow=${workflowId}`);
    this.gateway.emitToWorkflow(
      workflowId,
      WS_EVENTS.DIVERGENCE_REPORT_UPDATED,
      payload as unknown as Record<string, unknown>,
    );
  }

  // ─── Rules / Skills ──────────────────────────────────────────────

  emitRulesConflictDetected(
    workflowId: string,
    payload: RulesConflictDetectedPayload,
  ): void {
    this.logger.debug(`Emitting rules.conflict.detected for workflow=${workflowId}`);
    this.gateway.emitToWorkflow(
      workflowId,
      WS_EVENTS.RULES_CONFLICT_DETECTED,
      payload as unknown as Record<string, unknown>,
    );
  }

  emitSkillsApplicationLogged(
    pipelineExecutionId: string,
    payload: SkillsApplicationLoggedPayload,
  ): void {
    this.logger.debug(
      `Emitting skills.application.logged for pipeline=${pipelineExecutionId}`,
    );
    this.gateway.emitToPipeline(
      pipelineExecutionId,
      WS_EVENTS.SKILLS_APPLICATION_LOGGED,
      payload as unknown as Record<string, unknown>,
    );
  }

  // ─── Notifications ───────────────────────────────────────────────

  emitNotificationReviewRequest(
    userId: string,
    payload: NotificationReviewRequestPayload,
  ): void {
    this.logger.debug(`Emitting notification.review_request for user=${userId}`);
    this.gateway.emitToUser(
      userId,
      WS_EVENTS.NOTIFICATION_REVIEW_REQUEST,
      payload as unknown as Record<string, unknown>,
    );
  }
}
