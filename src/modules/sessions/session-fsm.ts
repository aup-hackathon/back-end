import { UnprocessableEntityException } from '@nestjs/common';

import { SessionMode, SessionStatus } from '../../database/enums';

export enum SessionFsmEvent {
  FIRST_USER_MESSAGE = 'first_user_message',
  AI_TASK_PUBLISHED = 'ai_task_published',
  AI_RESULT_RECEIVED = 'ai_result_received',
  AI_QUESTION_RECEIVED = 'ai_question_received',
  USER_ANSWER_POSTED = 'user_answer_posted',
  DIVERGENCE_DETECTED = 'divergence_detected',
  DIVERGENCE_RESOLVED = 'divergence_resolved',
  ENTER_REVIEW = 'enter_review',
  VALIDATE = 'validate',
  EXPORT_COMPLETED = 'export_completed',
  USER_FINALIZES = 'user_finalizes',
  PIPELINE_ERROR = 'pipeline_error',
  USER_DELETES = 'user_deletes',
}

type TransitionRule = {
  from: SessionStatus;
  event: SessionFsmEvent;
  to: SessionStatus;
  mode?: SessionMode;
};

export const SESSION_TRANSITIONS: TransitionRule[] = [
  {
    from: SessionStatus.CREATED,
    event: SessionFsmEvent.FIRST_USER_MESSAGE,
    to: SessionStatus.AWAITING_INPUT,
  },
  {
    from: SessionStatus.AWAITING_INPUT,
    event: SessionFsmEvent.AI_TASK_PUBLISHED,
    to: SessionStatus.PROCESSING,
  },
  {
    from: SessionStatus.PROCESSING,
    event: SessionFsmEvent.AI_RESULT_RECEIVED,
    to: SessionStatus.DRAFT_READY,
    mode: SessionMode.AUTO,
  },
  {
    from: SessionStatus.PROCESSING,
    event: SessionFsmEvent.AI_QUESTION_RECEIVED,
    to: SessionStatus.IN_ELICITATION,
    mode: SessionMode.INTERACTIVE,
  },
  {
    from: SessionStatus.IN_ELICITATION,
    event: SessionFsmEvent.USER_ANSWER_POSTED,
    to: SessionStatus.PROCESSING,
  },
  {
    from: SessionStatus.DRAFT_READY,
    event: SessionFsmEvent.DIVERGENCE_DETECTED,
    to: SessionStatus.NEEDS_RECONCILIATION,
  },
  {
    from: SessionStatus.NEEDS_RECONCILIATION,
    event: SessionFsmEvent.DIVERGENCE_RESOLVED,
    to: SessionStatus.DRAFT_READY,
  },
  {
    from: SessionStatus.DRAFT_READY,
    event: SessionFsmEvent.ENTER_REVIEW,
    to: SessionStatus.IN_REVIEW,
  },
  {
    from: SessionStatus.IN_REVIEW,
    event: SessionFsmEvent.VALIDATE,
    to: SessionStatus.VALIDATED,
  },
  {
    from: SessionStatus.VALIDATED,
    event: SessionFsmEvent.EXPORT_COMPLETED,
    to: SessionStatus.EXPORTED,
  },
  ...[
    SessionStatus.CREATED,
    SessionStatus.AWAITING_INPUT,
    SessionStatus.PROCESSING,
    SessionStatus.IN_ELICITATION,
    SessionStatus.DRAFT_READY,
    SessionStatus.NEEDS_RECONCILIATION,
    SessionStatus.IN_REVIEW,
  ].map((from) => ({
    from,
    event: SessionFsmEvent.USER_FINALIZES,
    to: SessionStatus.DRAFT_READY,
  })),
  ...Object.values(SessionStatus).map((from) => ({
    from,
    event: SessionFsmEvent.PIPELINE_ERROR,
    to: SessionStatus.ERROR,
  })),
  ...Object.values(SessionStatus).map((from) => ({
    from,
    event: SessionFsmEvent.USER_DELETES,
    to: SessionStatus.ARCHIVED,
  })),
];

export function transitionSessionStatus(
  from: SessionStatus,
  event: SessionFsmEvent,
  mode?: SessionMode,
): SessionStatus {
  const rule = SESSION_TRANSITIONS.find(
    (candidate) =>
      candidate.from === from &&
      candidate.event === event &&
      (!candidate.mode || candidate.mode === mode),
  );

  if (!rule) {
    throw new UnprocessableEntityException(`Invalid session transition: ${from} + ${event}`);
  }

  return rule.to;
}

export function canTransitionTo(
  from: SessionStatus,
  to: SessionStatus,
  mode?: SessionMode,
): boolean {
  return SESSION_TRANSITIONS.some(
    (candidate) =>
      candidate.from === from &&
      candidate.to === to &&
      (!candidate.mode || candidate.mode === mode),
  );
}
