import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { CustomerCognitiveState } from '../processors/cia/cognitive-state';
import {
  buildAutonomyExecutionKey,
  buildCognitiveMessage,
  isAutonomyExecutionDuplicate,
  normalizeAutonomyLedgerValue,
} from '../processors/autopilot/cognition-log.helpers';

const buildCognitiveState = (
  overrides: Partial<CustomerCognitiveState> = {},
): CustomerCognitiveState =>
  ({
    stage: 'COLD',
    trustScore: 0.5,
    urgencyScore: 0.3,
    objections: [],
    ...overrides,
  }) as CustomerCognitiveState;

describe('buildCognitiveMessage', () => {
  it('returns the action default message when no tactic is supplied', () => {
    const message = buildCognitiveMessage({
      action: 'ASK_CLARIFYING',
      state: buildCognitiveState(),
    });

    expect(message).toBe(
      'Pra eu te ajudar melhor, sua prioridade e valor, resultado ou proximo passo?',
    );
  });

  it('falls back to the _DEFAULT mapping when the action is unknown', () => {
    const message = buildCognitiveMessage({
      action: 'NOT_A_REAL_ACTION' as unknown as Parameters<
        typeof buildCognitiveMessage
      >[0]['action'],
    });

    expect(message).toBe('Estou acompanhando sua conversa. Posso seguir com voce por aqui.');
  });

  it('appends the matched product list to the default message', () => {
    const message = buildCognitiveMessage({
      action: 'OFFER',
      matchedProducts: ['Plano Pro', 'Trial 7 dias'],
    });

    expect(message).toBe(
      'Pelo que voce me disse sobre Plano Pro, Trial 7 dias, eu ja posso te mostrar a melhor opcao pra seguir.',
    );
  });

  it('selects the matching tactic resolver when available', () => {
    const message = buildCognitiveMessage({
      action: 'OFFER',
      tactic: 'CHECKOUT_SIMPLIFICATION',
      matchedProducts: ['Plano Pro'],
    });

    expect(message).toBe(
      'Pelo que voce me disse sobre Plano Pro, eu posso te mostrar a opcao mais simples pra avancar agora.',
    );
  });

  it('prefixes the first name only for empathic/storytelling tactics', () => {
    const message = buildCognitiveMessage({
      action: 'OFFER',
      tactic: 'EMPATHETIC_ECHO',
      contactName: '  Maria Joana da Silva  ',
    });

    expect(message.startsWith('Maria, ')).toBe(true);
  });

  it('omits the first-name prefix for tactics that should not use it', () => {
    const message = buildCognitiveMessage({
      action: 'OFFER',
      tactic: 'CHECKOUT_SIMPLIFICATION',
      contactName: 'Maria',
    });

    expect(message.startsWith('Maria')).toBe(false);
  });

  it('falls back to the action default when the tactic does not match any template', () => {
    const message = buildCognitiveMessage({
      action: 'FOLLOWUP_URGENT',
      tactic: 'NOT_A_REGISTERED_TACTIC',
    });

    expect(message).toBe(
      'Sua conversa esta perto de avancar. Se ainda fizer sentido, eu sigo com voce agora.',
    );
  });

  it('treats null/undefined tactic and contact name as empty', () => {
    const message = buildCognitiveMessage({
      action: 'SOCIAL_PROOF',
      tactic: null,
      contactName: undefined,
    });

    expect(message).toBe(
      'Faz sentido ter essa duvida. Se quiser, eu te mostro o que costuma destravar essa decisao.',
    );
  });
});

describe('normalizeAutonomyLedgerValue', () => {
  it('serializes Date instances to ISO strings', () => {
    const date = new Date('2026-01-02T03:04:05.000Z');
    expect(normalizeAutonomyLedgerValue(date)).toBe('2026-01-02T03:04:05.000Z');
  });

  it('normalizes nested arrays recursively', () => {
    expect(
      normalizeAutonomyLedgerValue([
        1,
        'two',
        new Date('2026-01-02T00:00:00.000Z'),
        [undefined, null],
      ]),
    ).toEqual([1, 'two', '2026-01-02T00:00:00.000Z', [null, null]]);
  });

  it('returns object keys in deterministic sorted order', () => {
    const result = normalizeAutonomyLedgerValue({ z: 1, a: 2, m: 3 });
    expect(Object.keys(result as Record<string, unknown>)).toEqual(['a', 'm', 'z']);
  });

  it('produces the same JSON for objects that differ only in key insertion order', () => {
    const left = normalizeAutonomyLedgerValue({ b: 1, a: 2, c: { y: 1, x: 2 } });
    const right = normalizeAutonomyLedgerValue({ c: { x: 2, y: 1 }, a: 2, b: 1 });
    expect(JSON.stringify(left)).toBe(JSON.stringify(right));
  });

  it('coerces undefined to null', () => {
    expect(normalizeAutonomyLedgerValue(undefined)).toBeNull();
  });

  it('preserves primitive values verbatim', () => {
    expect(normalizeAutonomyLedgerValue(42)).toBe(42);
    expect(normalizeAutonomyLedgerValue('foo')).toBe('foo');
    expect(normalizeAutonomyLedgerValue(false)).toBe(false);
    expect(normalizeAutonomyLedgerValue(null)).toBeNull();
  });
});

describe('buildAutonomyExecutionKey', () => {
  it('is stable across runs for the same input', () => {
    const input = {
      workspaceId: 'ws-1',
      actionType: 'OFFER',
      contactId: 'contact-1',
      conversationId: 'conv-1',
      phone: '5511999999999',
      payload: { foo: 'bar', count: 3 },
    };

    expect(buildAutonomyExecutionKey(input)).toBe(buildAutonomyExecutionKey(input));
  });

  it('is invariant to payload key insertion order', () => {
    const left = buildAutonomyExecutionKey({
      workspaceId: 'ws-1',
      actionType: 'OFFER',
      payload: { a: 1, b: 2 },
    });
    const right = buildAutonomyExecutionKey({
      workspaceId: 'ws-1',
      actionType: 'OFFER',
      payload: { b: 2, a: 1 },
    });

    expect(left).toBe(right);
  });

  it('changes when any identity field changes', () => {
    const base = buildAutonomyExecutionKey({
      workspaceId: 'ws-1',
      actionType: 'OFFER',
      payload: { x: 1 },
    });
    const swappedWorkspace = buildAutonomyExecutionKey({
      workspaceId: 'ws-2',
      actionType: 'OFFER',
      payload: { x: 1 },
    });
    const swappedAction = buildAutonomyExecutionKey({
      workspaceId: 'ws-1',
      actionType: 'FOLLOWUP',
      payload: { x: 1 },
    });
    const swappedContact = buildAutonomyExecutionKey({
      workspaceId: 'ws-1',
      actionType: 'OFFER',
      contactId: 'contact-9',
      payload: { x: 1 },
    });
    const swappedPayload = buildAutonomyExecutionKey({
      workspaceId: 'ws-1',
      actionType: 'OFFER',
      payload: { x: 2 },
    });

    expect(
      new Set([base, swappedWorkspace, swappedAction, swappedContact, swappedPayload]).size,
    ).toBe(5);
  });

  it('emits a 64-character lowercase hex sha256 digest', () => {
    const key = buildAutonomyExecutionKey({
      workspaceId: 'ws-1',
      actionType: 'OFFER',
      payload: {},
    });

    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it('matches a manual sha256 over the normalized payload envelope', () => {
    const input = {
      workspaceId: 'ws-1',
      actionType: 'OFFER',
      contactId: 'contact-1',
      conversationId: 'conv-1',
      phone: '5511999999999',
      payload: { b: 2, a: 1 },
    };

    const expected = createHash('sha256')
      .update(
        JSON.stringify(
          normalizeAutonomyLedgerValue({
            workspaceId: input.workspaceId,
            actionType: input.actionType,
            contactId: input.contactId,
            conversationId: input.conversationId,
            phone: input.phone,
            payload: input.payload,
          }),
        ),
      )
      .digest('hex');

    expect(buildAutonomyExecutionKey(input)).toBe(expected);
  });

  it('coerces missing identifiers to null in the digest envelope', () => {
    const omitted = buildAutonomyExecutionKey({
      workspaceId: 'ws-1',
      actionType: 'OFFER',
      payload: {},
    });
    const explicit = buildAutonomyExecutionKey({
      workspaceId: 'ws-1',
      actionType: 'OFFER',
      contactId: undefined,
      conversationId: undefined,
      phone: undefined,
      payload: {},
    });

    expect(omitted).toBe(explicit);
  });
});

describe('isAutonomyExecutionDuplicate', () => {
  it('returns true for Prisma P2002 unique-constraint errors', () => {
    expect(isAutonomyExecutionDuplicate({ code: 'P2002' })).toBe(true);
  });

  it('returns true when the error message mentions a unique constraint', () => {
    expect(
      isAutonomyExecutionDuplicate({
        message: 'Unique constraint failed on the fields: (`idempotencyKey`)',
      }),
    ).toBe(true);
  });

  it('matches the unique-constraint hint case-insensitively', () => {
    expect(isAutonomyExecutionDuplicate({ message: 'UNIQUE CONSTRAINT triggered' })).toBe(true);
  });

  it('returns false for non-Prisma errors without the unique-constraint phrase', () => {
    expect(isAutonomyExecutionDuplicate({ code: 'P5000', message: 'timeout' })).toBe(false);
  });

  it('handles null/undefined/non-record inputs safely', () => {
    expect(isAutonomyExecutionDuplicate(undefined)).toBe(false);
    expect(isAutonomyExecutionDuplicate(null)).toBe(false);
    expect(isAutonomyExecutionDuplicate('something went wrong')).toBe(false);
  });
});
