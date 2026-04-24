export enum UserRole {
  ADMIN = 'admin',
  PROCESS_OWNER = 'process_owner',
  BUSINESS_ANALYST = 'business_analyst',
  REVIEWER = 'reviewer',
  VIEWER = 'viewer',
}

export enum WorkflowStatus {
  DRAFT = 'draft',
  IN_ELICITATION = 'in_elicitation',
  PENDING_REVIEW = 'pending_review',
  VALIDATED = 'validated',
  EXPORTED = 'exported',
  ARCHIVED = 'archived',
}

export enum SessionMode {
  AUTO = 'auto',
  INTERACTIVE = 'interactive',
}

export enum SessionStatus {
  CREATED = 'created',
  AWAITING_INPUT = 'awaiting_input',
  PROCESSING = 'processing',
  DRAFT_READY = 'draft_ready',
  NEEDS_RECONCILIATION = 'needs_reconciliation',
  IN_ELICITATION = 'in_elicitation',
  IN_REVIEW = 'in_review',
  VALIDATED = 'validated',
  EXPORTED = 'exported',
  ARCHIVED = 'archived',
  ERROR = 'error',
}

export enum MessageRole {
  USER = 'user',
  AI = 'ai',
  SYSTEM = 'system',
}

export enum MessageType {
  USER_INPUT = 'user_input',
  AI_QUESTION = 'ai_question',
  AI_RESPONSE = 'ai_response',
  AI_SUMMARY = 'ai_summary',
  AI_UPDATE = 'ai_update',
  AI_CONFIDENCE_REPORT = 'ai_confidence_report',
  SYSTEM_NOTE = 'system_note',
  SYSTEM_STATUS = 'system_status',
}

export enum CommentType {
  QUESTION = 'question',
  CORRECTION = 'correction',
  APPROVAL = 'approval',
  SUGGESTION = 'suggestion',
  ESCALATION = 'escalation',
}

export enum ActorType {
  USER = 'user',
  AI_AGENT = 'ai_agent',
  SYSTEM = 'system',
}

export enum AgentType {
  ORCHESTRATOR = 'ORCHESTRATOR',
  INTAKE = 'INTAKE',
  EXTRACTION = 'EXTRACTION',
  PATTERN = 'PATTERN',
  GAP_DETECTION = 'GAP_DETECTION',
  QA = 'QA',
  VALIDATION = 'VALIDATION',
  EXPORT = 'EXPORT',
  DIVERGENCE = 'DIVERGENCE',
  RULES_SKILLS_LOADER = 'RULES_SKILLS_LOADER',
}

export enum PipelineTaskType {
  FULL_PIPELINE = 'FULL_PIPELINE',
  SCOPED_REPROCESS = 'SCOPED_REPROCESS',
  EXPORT_ONLY = 'EXPORT_ONLY',
  QA_ROUND = 'QA_ROUND',
}

export enum PipelineStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum AgentExecutionStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED',
}

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
}

export enum ConfigOverrideScope {
  ORG = 'ORG',
  SESSION = 'SESSION',
}

export enum GraphType {
  INTENT = 'INTENT',
  GENERATED = 'GENERATED',
  EXECUTED = 'EXECUTED',
  RECONCILED = 'RECONCILED',
}

export enum GraphSource {
  AI_EXTRACTION = 'AI_EXTRACTION',
  AI_GENERATION = 'AI_GENERATION',
  ELSA_IMPORT = 'ELSA_IMPORT',
  MANUAL_MERGE = 'MANUAL_MERGE',
}

export enum ComparisonType {
  INTENT_VS_GENERATED = 'INTENT_VS_GENERATED',
  GENERATED_VS_EXECUTED = 'GENERATED_VS_EXECUTED',
  INTENT_VS_EXECUTED = 'INTENT_VS_EXECUTED',
}

export enum DivergenceSeverity {
  NONE = 'NONE',
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum DivergenceReportStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum DivergencePointType {
  MISSING_NODE = 'MISSING_NODE',
  EXTRA_NODE = 'EXTRA_NODE',
  MODIFIED_NODE = 'MODIFIED_NODE',
  ACTOR_MISMATCH = 'ACTOR_MISMATCH',
  CONDITION_MISMATCH = 'CONDITION_MISMATCH',
  MISSING_EDGE = 'MISSING_EDGE',
  EXTRA_EDGE = 'EXTRA_EDGE',
  REORDERED_SEQUENCE = 'REORDERED_SEQUENCE',
  LOOP_DIFFERENCE = 'LOOP_DIFFERENCE',
  MISSING_PATH = 'MISSING_PATH',
  PARALLELISM_CHANGE = 'PARALLELISM_CHANGE',
}

export enum PointSeverity {
  INFO = 'INFO',
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum ReconciliationActionType {
  ACCEPT_A = 'ACCEPT_A',
  ACCEPT_B = 'ACCEPT_B',
  AI_SUGGEST_APPLY = 'AI_SUGGEST_APPLY',
  MANUAL_EDIT = 'MANUAL_EDIT',
  SKIP = 'SKIP',
}

export enum RuleType {
  EXTRACTION = 'EXTRACTION',
  ACTOR_MAPPING = 'ACTOR_MAPPING',
  STRUCTURAL_CONSTRAINT = 'STRUCTURAL_CONSTRAINT',
  VALIDATION = 'VALIDATION',
  NAMING_CONVENTION = 'NAMING_CONVENTION',
  PROMPT_INJECTION = 'PROMPT_INJECTION',
}

export enum RuleScope {
  ORG = 'ORG',
  WORKFLOW = 'WORKFLOW',
  AGENT = 'AGENT',
}

export enum SkillType {
  VOCABULARY = 'VOCABULARY',
  ARCHETYPE = 'ARCHETYPE',
  FEW_SHOT_EXAMPLE = 'FEW_SHOT_EXAMPLE',
  DOMAIN_KNOWLEDGE = 'DOMAIN_KNOWLEDGE',
  ACTOR_CATALOG = 'ACTOR_CATALOG',
  PROMPT_TEMPLATE = 'PROMPT_TEMPLATE',
}
