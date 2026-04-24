import { UnprocessableEntityException } from '@nestjs/common';

import { SessionMode, SessionStatus } from '../../database/enums';
import { SESSION_TRANSITIONS, SessionFsmEvent, transitionSessionStatus } from './session-fsm';

describe('session FSM', () => {
  it.each(SESSION_TRANSITIONS)('allows $from + $event -> $to', (rule) => {
    expect(transitionSessionStatus(rule.from, rule.event, rule.mode)).toBe(rule.to);
  });

  it('rejects every transition not listed in the transition table', () => {
    for (const from of Object.values(SessionStatus)) {
      for (const event of Object.values(SessionFsmEvent)) {
        for (const mode of [SessionMode.AUTO, SessionMode.INTERACTIVE, undefined]) {
          const expected = SESSION_TRANSITIONS.some(
            (rule) =>
              rule.from === from && rule.event === event && (!rule.mode || rule.mode === mode),
          );

          if (!expected) {
            expect(() => transitionSessionStatus(from, event, mode)).toThrow(
              UnprocessableEntityException,
            );
          }
        }
      }
    }
  });

  it('blocks validation while reconciliation is still required', () => {
    expect(() =>
      transitionSessionStatus(SessionStatus.NEEDS_RECONCILIATION, SessionFsmEvent.VALIDATE),
    ).toThrow(UnprocessableEntityException);
  });
});
