import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { NatsClientService } from '../../../infra/nats/nats.client';
import { CONSUMERS, SUBJECTS } from '../../../core/messaging';
import { AiTaskProgressEvent } from '../../../core/messaging/events/ai-tasks.event';
import { WorkflowUpdatedEvent } from '../../../core/messaging/events/workflow-events.event';
import { SessionFinalizedEvent } from '../../../core/messaging/events/session-events.event';
import { DocumentPreprocessResultEvent } from '../../../core/messaging/events/document-preprocess.event';
import { SystemHealthPingEvent } from '../../../core/messaging/events/system-health.event';
import { Document } from '../../documents/entities/document.entity';
import { RealtimeGateway } from '../realtime.gateway';
import { WS_EVENTS, WS_ROOMS } from '../constants/ws-events.constants';
import {
  PipelineProgressPayload,
  AgentLogPayload,
  AgentStatusPayload,
  WorkflowUpdatedPayload,
  SessionFinalizedPayload,
  DocumentReadyPayload,
  SystemHealthAlertPayload,
} from '../interfaces/ws-payloads.interface';

/**
 * Bridges NATS JetStream messages to WebSocket rooms.
 *
 * Subscribes to relevant NATS subjects on startup and forwards
 * each message to the appropriate Socket.IO room(s).
 *
 * Backpressure: if a room has no listeners, the NATS message is acked
 * but the WS emit is skipped (no queuing for disconnected clients).
 */
@Injectable()
export class NatsWsBridgeService implements OnModuleInit {
  private readonly logger = new Logger(NatsWsBridgeService.name);

  constructor(
    private readonly natsClient: NatsClientService,
    private readonly gateway: RealtimeGateway,
    @InjectRepository(Document)
    private readonly documentsRepo: Repository<Document>,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('Starting NATS → WebSocket bridge subscriptions');
    await Promise.all([
      this.subscribeAiProgress(),
      this.subscribeWorkflowUpdated(),
      this.subscribeSessionFinalized(),
      this.subscribeDocumentReady(),
      this.subscribeSystemHealth(),
    ]);
    this.logger.log('NATS → WebSocket bridge is active');
  }

  // ─── ai.tasks.progress → pipeline.progress, agent.log, agent.status ──

  private async subscribeAiProgress(): Promise<void> {
    await this.natsClient.subscribeDurable({
      subject: SUBJECTS.AI_TASKS_PROGRESS,
      durableName: `${CONSUMERS.AI_PROGRESS}-ws`,
      handler: async (raw) => {
        const payload = raw as unknown as AiTaskProgressEvent;
        const sessionRoom = WS_ROOMS.session(payload.session_id);
        const pipelineRoom = WS_ROOMS.pipeline(payload.pipeline_execution_id);

        // pipeline.progress → session:* and pipeline:*
        const progressPayload: PipelineProgressPayload = {
          session_id: payload.session_id,
          pipeline_execution_id: payload.pipeline_execution_id,
          agent_type: payload.agent_type,
          agent_name: payload.agent_name,
          status: payload.status,
          order_index: payload.order_index,
          progress_pct: payload.progress_pct,
          confidence_output: payload.confidence_output,
        };

        if (this.gateway.hasListeners(sessionRoom)) {
          this.gateway.emitToSession(
            payload.session_id,
            WS_EVENTS.PIPELINE_PROGRESS,
            progressPayload as unknown as Record<string, unknown>,
          );
        }
        if (this.gateway.hasListeners(pipelineRoom)) {
          this.gateway.emitToPipeline(
            payload.pipeline_execution_id,
            WS_EVENTS.PIPELINE_PROGRESS,
            progressPayload as unknown as Record<string, unknown>,
          );
        }

        // agent.log → pipeline:* (only if log field is present)
        if (payload.log) {
          const logPayload: AgentLogPayload = {
            agent_execution_id: payload.agent_execution_id,
            log_level: payload.log.level,
            message: payload.log.message,
            metadata: payload.log.metadata,
            created_at: new Date().toISOString(),
          };
          if (this.gateway.hasListeners(pipelineRoom)) {
            this.gateway.emitToPipeline(
              payload.pipeline_execution_id,
              WS_EVENTS.AGENT_LOG,
              logPayload as unknown as Record<string, unknown>,
            );
          }
        }

        // agent.status → pipeline:*
        const statusPayload: AgentStatusPayload = {
          agent_execution_id: payload.agent_execution_id,
          status: payload.status,
          error_message: payload.error_message,
        };
        if (this.gateway.hasListeners(pipelineRoom)) {
          this.gateway.emitToPipeline(
            payload.pipeline_execution_id,
            WS_EVENTS.AGENT_STATUS,
            statusPayload as unknown as Record<string, unknown>,
          );
        }
      },
    });
  }

  // ─── workflow.events.updated → workflow.updated ───────────────────

  private async subscribeWorkflowUpdated(): Promise<void> {
    await this.natsClient.subscribeDurable({
      subject: SUBJECTS.WORKFLOW_UPDATED,
      durableName: `nestjs-workflow-updated-ws`,
      handler: async (raw) => {
        const payload = raw as unknown as WorkflowUpdatedEvent;
        const room = WS_ROOMS.workflow(payload.workflow_id);
        if (!this.gateway.hasListeners(room)) return;

        const wsPayload: WorkflowUpdatedPayload = {
          workflow_id: payload.workflow_id,
          version_number: payload.version_number,
          changed_elements: payload.changed_elements,
          source: payload.source,
          correlation_id: payload.correlation_id,
        };
        this.gateway.emitToWorkflow(
          payload.workflow_id,
          WS_EVENTS.WORKFLOW_UPDATED,
          wsPayload as unknown as Record<string, unknown>,
        );
      },
    });
  }

  // ─── session.events.finalized → session.finalized ─────────────────

  private async subscribeSessionFinalized(): Promise<void> {
    await this.natsClient.subscribeDurable({
      subject: SUBJECTS.SESSION_FINALIZED,
      durableName: `nestjs-session-finalized-ws`,
      handler: async (raw) => {
        const payload = raw as unknown as SessionFinalizedEvent;
        const room = WS_ROOMS.session(payload.session_id);
        if (!this.gateway.hasListeners(room)) return;

        const wsPayload: SessionFinalizedPayload = {
          session_id: payload.session_id,
          workflow_id: payload.workflow_id,
          final_version_number: payload.final_version_number,
          final_confidence: payload.final_confidence,
        };
        this.gateway.emitToSession(
          payload.session_id,
          WS_EVENTS.SESSION_FINALIZED,
          wsPayload as unknown as Record<string, unknown>,
        );
      },
    });
  }

  // ─── document.preprocess.result → document.ready ──────────────────

  private async subscribeDocumentReady(): Promise<void> {
    await this.natsClient.subscribeDurable({
      subject: SUBJECTS.DOCUMENT_PREPROCESS_RESULT,
      durableName: `${CONSUMERS.DOCUMENT_PREPROCESS_RESULT}-ws`,
      handler: async (raw) => {
        const payload = raw as unknown as DocumentPreprocessResultEvent;
        // We need the session_id for routing — look up via document
        const document = await this.documentsRepo.findOne({
          where: { id: payload.document_id },
          select: ['id', 'sessionId'],
        });

        if (!document?.sessionId) {
          this.logger.warn(
            `document.ready: no session found for document ${payload.document_id}`,
          );
          return;
        }

        const room = WS_ROOMS.session(document.sessionId);
        if (!this.gateway.hasListeners(room)) return;

        const preview = (payload.extracted_text || '').slice(0, 500);
        const wsPayload: DocumentReadyPayload = {
          document_id: payload.document_id,
          extracted_text_preview: preview,
          confidence: payload.preprocessing_confidence ?? 0,
        };
        this.gateway.emitToSession(
          document.sessionId,
          WS_EVENTS.DOCUMENT_READY,
          wsPayload as unknown as Record<string, unknown>,
        );
      },
    });
  }

  // ─── system.health.ping → system.health.alert ─────────────────────

  private async subscribeSystemHealth(): Promise<void> {
    await this.natsClient.subscribeDurable({
      subject: SUBJECTS.SYSTEM_HEALTH_PING,
      durableName: `${CONSUMERS.HEALTH_PING}-ws`,
      handler: async (raw) => {
        const payload = raw as unknown as SystemHealthPingEvent;
        if (!this.gateway.hasListeners(WS_ROOMS.adminHealth)) return;

        const wsPayload: SystemHealthAlertPayload = {
          component: payload.service,
          status: payload.status,
          since: payload.timestamp,
          details: payload.details,
        };
        this.gateway.emitToAdminHealth(
          WS_EVENTS.SYSTEM_HEALTH_ALERT,
          wsPayload as unknown as Record<string, unknown>,
        );
      },
    });
  }
}
