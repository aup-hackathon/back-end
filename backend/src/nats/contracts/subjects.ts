// FROZEN — do not edit without coordinated FastAPI change.
export const SUBJECTS = {
  AI_TASKS_NEW: 'ai.tasks.new',
  AI_TASKS_RESULT: 'ai.tasks.result',
  AI_TASKS_PROGRESS: 'ai.tasks.progress',
  AI_TASKS_DIVERGENCE: 'ai.tasks.divergence',
  AI_TASKS_DIVERGENCE_RESULT: 'ai.tasks.divergence.result',
  AI_CONTEXT_LOAD: 'ai.context.load',
  WORKFLOW_UPDATED: 'workflow.events.updated',
  SESSION_FINALIZED: 'session.events.finalized',
  SYSTEM_HEALTH_PING: 'system.health.ping',
  DEAD_LETTER_PREFIX: 'dead.flowforge.',
} as const;

export const CONSUMERS = {
  AI_RESULT: 'nestjs-ai-result',
  AI_PROGRESS: 'nestjs-ai-progress',
  DIVERGENCE_RESULT: 'nestjs-divergence-result',
  HEALTH_PING: 'nestjs-health-ping',
} as const;

export const STREAM_SUBJECTS = [
  'ai.tasks.*',
  'ai.tasks.>',
  'ai.context.*',
  'workflow.events.*',
  'session.events.*',
  'system.health.*',
  'dead.flowforge.>',
] as const;
