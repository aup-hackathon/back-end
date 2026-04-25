/**
 * Authoritative server → client WebSocket event catalog.
 * Both FE and BE-10 reference this list.
 */
export const WS_EVENTS = {
  // Pipeline / Agent events
  PIPELINE_PROGRESS: 'pipeline.progress',
  AGENT_LOG: 'agent.log',
  AGENT_STATUS: 'agent.status',

  // Workflow events
  WORKFLOW_UPDATED: 'workflow.updated',

  // Session events
  SESSION_STATE: 'session.state',
  SESSION_NEEDS_RECONCILIATION: 'session.needs_reconciliation',
  SESSION_FINALIZED: 'session.finalized',

  // Document events
  DOCUMENT_READY: 'document.ready',

  // Collaboration events
  COMMENT_CREATED: 'comment.created',
  COMMENT_RESOLVED: 'comment.resolved',

  // Divergence events
  DIVERGENCE_REPORT_READY: 'divergence.report.ready',
  DIVERGENCE_REPORT_UPDATED: 'divergence.report.updated',

  // Rules / Skills events
  RULES_CONFLICT_DETECTED: 'rules.conflict.detected',
  SKILLS_APPLICATION_LOGGED: 'skills.application.logged',

  // System events
  SYSTEM_HEALTH_ALERT: 'system.health.alert',

  // Notification events
  NOTIFICATION_REVIEW_REQUEST: 'notification.review_request',
} as const;

/**
 * Room name factories — single source of truth for room key patterns.
 */
export const WS_ROOMS = {
  user: (userId: string) => `user:${userId}`,
  session: (sessionId: string) => `session:${sessionId}`,
  workflow: (workflowId: string) => `workflow:${workflowId}`,
  pipeline: (pipelineExecutionId: string) => `pipeline:${pipelineExecutionId}`,
  adminHealth: 'admin-health',
} as const;

/** Client → server events the gateway listens to. */
export const WS_CLIENT_EVENTS = {
  JOIN_ROOM: 'joinRoom',
  LEAVE_ROOM: 'leaveRoom',
} as const;

/** Emitted back to the client on room-join failure. */
export const WS_ERROR_EVENTS = {
  JOIN_ERROR: 'join_error',
} as const;

export type WsEventName = (typeof WS_EVENTS)[keyof typeof WS_EVENTS];
