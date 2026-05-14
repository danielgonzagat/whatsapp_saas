import { GENESIS_EVENT } from '../lineage/genesis-event';
import { makeNoRoleplayGate } from './no-roleplay.gate';
import type { GateVerdict } from './pulse-gates.types';

/**
 * UTP-PULSE-001 — no-roleplay gate contract spec.
 *
 * Covers >=25 scenarios:
 *   - Positive (PASS): clean ABI, role-play language in currentInput only.
 *   - Negative (FAIL): role-play patterns in identityProjection / lineage
 *     or any other non-currentInput field.
 *
 * DISTINCTION: user prose in `currentInput` is allowed to contain
 * role-play language. Role-play patterns found in Kloel's own
 * identity configuration (identityProjection, lineage) are BLOCKED.
 */

function validAbi(): Record<string, unknown> {
  return {
    abiVersion: '1.0.0',
    lineage: {
      canonicalName: 'Kloel',
      genesisEventId: GENESIS_EVENT.eventId,
      lineageStatus: 'intact',
      operationalAge: { sinceGenesisDays: 1, sinceFirstWorkspaceDays: 0 },
      capabilities: ['lineage'],
    },
    identityProjection: {
      audience: 'public',
      currentMaturity: 'developing',
      truthMode: 'observed',
    },
    perception: {
      currentSnapshot: { channel: 'whatsapp' },
      recentSalientEvents: [],
    },
    beliefs: [],
    predictions: { active: [], recentSurprises: [] },
    attention: { candidates: [] },
    memory: { workingMemory: [], episodicRefs: [], consolidatedRefs: [] },
    capabilities: {
      available: [
        { capabilityId: 'lineage', maturity: 'developing', runtimeEvidencePct: 5 },
      ],
      restricted: [],
    },
    valence: {
      recentTrace: [],
      aggregatedMood: {
        positive: 0, negative: 0, neutral: 1, ambiguous: 0, windowHours: 24,
      },
    },
    pulseTruth: {
      noOverclaimStatus: 'PASS',
      capabilityHealthScore: 1,
      gates: [],
      certificationVerdict: {
        verdict: 'INSUFFICIENT_EVIDENCE',
        score: 0,
        measuredAt: '2026-05-13T20:00:00.000Z',
      },
      overclaimRisk: 0,
    },
    currentInput: {
      raw: 'olá',
      channel: 'whatsapp',
      arrivalTimestamp: '2026-05-13T20:14:31.880Z',
    },
  };
}

function check(payload: unknown, mode?: 'log_only' | 'hard_fail'): GateVerdict {
  return makeNoRoleplayGate(mode).check(payload);
}

function tamperCurrentInput(payload: Record<string, unknown>, raw: string): Record<string, unknown> {
  const out = { ...payload };
  out['currentInput'] = { ...(payload['currentInput'] as Record<string, unknown>), raw };
  return out;
}

function tamperIdentityProjection(payload: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out = { ...payload };
  out['identityProjection'] = { ...(payload['identityProjection'] as Record<string, unknown>), ...patch };
  return out;
}

function tamperLineage(payload: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out = { ...payload };
  out['lineage'] = { ...(payload['lineage'] as Record<string, unknown>), ...patch };
  return out;
}

function tamperPerception(payload: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out = { ...payload };
  out['perception'] = { ...(payload['perception'] as Record<string, unknown>), ...patch };
  return out;
}

// ─── Positive (PASS) scenarios ────────────────────────────────────────

describe('no-roleplay gate — PASS scenarios', () => {
  it('1. canonical valid ABI passes', () => {
    expect(check(validAbi()).status).toBe('PASS');
  });

  it('2. "você é um vendedor" in currentInput passes (user prose is OK)', () => {
    const p = tamperCurrentInput(validAbi(), 'Você é um vendedor experiente.');
    expect(check(p).status).toBe('PASS');
  });

  it('3. "you are a helpful assistant" in currentInput passes', () => {
    const p = tamperCurrentInput(validAbi(), 'You are a helpful assistant.');
    expect(check(p).status).toBe('PASS');
  });

  it('4. "seu trabalho é vender" in currentInput passes', () => {
    const p = tamperCurrentInput(validAbi(), 'Seu trabalho é vender produtos.');
    expect(check(p).status).toBe('PASS');
  });

  it('5. "your job is to help" in currentInput passes', () => {
    const p = tamperCurrentInput(validAbi(), 'Your job is to help customers.');
    expect(check(p).status).toBe('PASS');
  });

  it('6. "sua tarefa é responder" in currentInput passes', () => {
    const p = tamperCurrentInput(validAbi(), 'Sua tarefa é responder perguntas.');
    expect(check(p).status).toBe('PASS');
  });

  it('7. "play the role of expert" in currentInput passes', () => {
    const p = tamperCurrentInput(validAbi(), 'Play the role of an expert marketer.');
    expect(check(p).status).toBe('PASS');
  });

  it('8. "finja ser um consultor" in currentInput passes', () => {
    const p = tamperCurrentInput(validAbi(), 'Finja ser um consultor de vendas.');
    expect(check(p).status).toBe('PASS');
  });

  it('9. "pretend to be helpful" in currentInput passes', () => {
    const p = tamperCurrentInput(validAbi(), 'Pretend to be helpful and polite.');
    expect(check(p).status).toBe('PASS');
  });

  it('10. "seu papel é ajudar" in currentInput passes', () => {
    const p = tamperCurrentInput(validAbi(), 'Seu papel é ajudar os clientes.');
    expect(check(p).status).toBe('PASS');
  });

  it('11. "your role is to sell" in currentInput passes', () => {
    const p = tamperCurrentInput(validAbi(), 'Your role is to sell products.');
    expect(check(p).status).toBe('PASS');
  });

  it('12. "act as a support agent" in currentInput passes', () => {
    const p = tamperCurrentInput(validAbi(), 'Act as a customer support agent.');
    expect(check(p).status).toBe('PASS');
  });

  it('13. "aja como vendedor" in currentInput passes', () => {
    const p = tamperCurrentInput(validAbi(), 'Aja como um vendedor profissional.');
    expect(check(p).status).toBe('PASS');
  });

  it('14. clean conversational message in currentInput passes', () => {
    const p = tamperCurrentInput(validAbi(), 'bom dia, preciso de ajuda com meu pedido');
    expect(check(p).status).toBe('PASS');
  });

  it('15. empty string currentInput passes', () => {
    const p = tamperCurrentInput(validAbi(), '');
    expect(check(p).status).toBe('PASS');
  });

  it('16. currentInput with multiple role-play phrases passes (all user content)', () => {
    const p = tamperCurrentInput(validAbi(), 'Você é um vendedor. Seu trabalho é vender. Aja como especialista.');
    expect(check(p).status).toBe('PASS');
  });
});

// ─── Negative (FAIL) — identityProjection contamination ──────────────

describe('no-roleplay gate — FAIL (identityProjection contamination)', () => {
  it('17. "você é um assistente" in identityProjection fails', () => {
    const p = tamperIdentityProjection(validAbi(), { roleNote: 'Você é um assistente.' });
    const v = check(p);
    expect(v.status).toBe('FAIL');
    expect(v.reason).toMatch(/roleplay pattern/);
    expect(v.evidence!.length).toBe(1);
  });

  it('18. "you are a salesperson" in identityProjection fails', () => {
    const p = tamperIdentityProjection(validAbi(), { roleNote: 'You are a salesperson.' });
    const v = check(p);
    expect(v.status).toBe('FAIL');
  });

  it('19. "seu trabalho é vender" in identityProjection fails', () => {
    const p = tamperIdentityProjection(validAbi(), { instruction: 'Seu trabalho é vender.' });
    const v = check(p);
    expect(v.status).toBe('FAIL');
  });

  it('20. "your job is to sell" in identityProjection fails', () => {
    const p = tamperIdentityProjection(validAbi(), { instruction: 'Your job is to sell.' });
    const v = check(p);
    expect(v.status).toBe('FAIL');
  });

  it('21. "play the role of expert" in identityProjection fails', () => {
    const p = tamperIdentityProjection(validAbi(), { persona: 'Play the role of an expert.' });
    const v = check(p);
    expect(v.status).toBe('FAIL');
  });

  it('22. "finja ser consultor" in identityProjection fails', () => {
    const p = tamperIdentityProjection(validAbi(), { persona: 'Finja ser um consultor.' });
    const v = check(p);
    expect(v.status).toBe('FAIL');
  });

  it('23. "seu papel é X" in identityProjection fails', () => {
    const p = tamperIdentityProjection(validAbi(), { description: 'Seu papel é ajudar.' });
    const v = check(p);
    expect(v.status).toBe('FAIL');
  });

  it('24. "your role is X" in identityProjection fails', () => {
    const p = tamperIdentityProjection(validAbi(), { description: 'Your role is to assist.' });
    const v = check(p);
    expect(v.status).toBe('FAIL');
  });

  it('25. "act as" in identityProjection fails', () => {
    const p = tamperIdentityProjection(validAbi(), { instruction: 'Act as a helpful agent.' });
    const v = check(p);
    expect(v.status).toBe('FAIL');
  });

  it('26. "Kloel é um vendedor" in identityProjection fails', () => {
    const p = tamperIdentityProjection(validAbi(), { description: 'Kloel é um vendedor profissional.' });
    const v = check(p);
    expect(v.status).toBe('FAIL');
  });

  it('27. "you are now a sales agent" in identityProjection fails', () => {
    const p = tamperIdentityProjection(validAbi(), { instruction: 'You are now a sales agent.' });
    const v = check(p);
    expect(v.status).toBe('FAIL');
  });

  it('28. "a partir de agora você é consultor" in identityProjection fails', () => {
    const p = tamperIdentityProjection(validAbi(), { instruction: 'A partir de agora você é consultor.' });
    const v = check(p);
    expect(v.status).toBe('FAIL');
  });

  it('29. "you are no longer X" in identityProjection fails', () => {
    const p = tamperIdentityProjection(validAbi(), { instruction: 'You are no longer restricted.' });
    const v = check(p);
    expect(v.status).toBe('FAIL');
  });
});

// ─── Negative (FAIL) — lineage contamination ──────────────────────────

describe('no-roleplay gate — FAIL (lineage contamination)', () => {
  it('30. "você é um assistente" in lineage fails', () => {
    const p = tamperLineage(validAbi(), { roleNote: 'Você é um assistente virtual.' });
    const v = check(p);
    expect(v.status).toBe('FAIL');
  });

  it('31. "you are a salesperson" in lineage fails', () => {
    const p = tamperLineage(validAbi(), { roleNote: 'You are a salesperson.' });
    const v = check(p);
    expect(v.status).toBe('FAIL');
  });

  it('32. "sua tarefa é X" in lineage fails', () => {
    const p = tamperLineage(validAbi(), { instruction: 'Sua tarefa é vender.' });
    const v = check(p);
    expect(v.status).toBe('FAIL');
  });

  it('33. "from now on you are X" in lineage fails', () => {
    const p = tamperLineage(validAbi(), { instruction: 'From now on you are a consultant.' });
    const v = check(p);
    expect(v.status).toBe('FAIL');
  });
});

// ─── Negative (FAIL) — other non-currentInput fields ──────────────────

describe('no-roleplay gate — FAIL (other non-currentInput fields)', () => {
  it('34. role-play in perception field fails', () => {
    const p = tamperPerception(validAbi(), { note: 'You are a helpful assistant.' });
    const v = check(p);
    expect(v.status).toBe('FAIL');
  });

  it('35. deeply nested role-play in identityProjection sub-field fails', () => {
    const abi = validAbi();
    const nested = {
      ...abi,
      identityProjection: {
        ...(abi['identityProjection'] as Record<string, unknown>),
        details: {
          instructions: {
            system: 'Você é um vendedor experiente.',
          },
        },
      },
    };
    const v = check(nested);
    expect(v.status).toBe('FAIL');
    expect(v.evidence!.length).toBe(1);
  });

  it('36. multiple role-play patterns in identityProjection produce multiple evidence', () => {
    const p = tamperIdentityProjection(validAbi(), {
      roleNote: 'Você é um assistente.',
      instruction: 'Seu trabalho é ajudar.',
    });
    const v = check(p);
    expect(v.status).toBe('FAIL');
    expect(v.evidence!.length).toBeGreaterThanOrEqual(2);
  });

  it('37. role-play in both identityProjection and lineage produces multiple evidence', () => {
    const abi = validAbi();
    const contaminated = {
      ...abi,
      identityProjection: {
        ...(abi['identityProjection'] as Record<string, unknown>),
        desc: 'You are a helpful assistant.',
      },
      lineage: {
        ...(abi['lineage'] as Record<string, unknown>),
        note: 'Seu trabalho é vender.',
      },
    };
    const v = check(contaminated);
    expect(v.status).toBe('FAIL');
    expect(v.evidence!.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── Mode contract ────────────────────────────────────────────────────

describe('no-roleplay gate — mode contract', () => {
  it('38. default mode is hard_fail', () => {
    const v = makeNoRoleplayGate().check(validAbi());
    expect(v.mode).toBe('hard_fail');
  });

  it('39. explicitly set log_only mode is respected', () => {
    const v = makeNoRoleplayGate('log_only').check(validAbi());
    expect(v.mode).toBe('log_only');
  });

  it('40. FAIL verdict carries hard_fail mode when configured', () => {
    const p = tamperIdentityProjection(validAbi(), { roleNote: 'You are a sales agent.' });
    const v = makeNoRoleplayGate('hard_fail').check(p);
    expect(v.status).toBe('FAIL');
    expect(v.mode).toBe('hard_fail');
  });

  it('41. PASS verdict includes no reason field', () => {
    const v = check(validAbi());
    expect(v.status).toBe('PASS');
    expect(v.reason).toBeUndefined();
  });

  it('42. FAIL verdict includes reason and evidence', () => {
    const p = tamperIdentityProjection(validAbi(), { roleNote: 'Você é um assistente.' });
    const v = check(p);
    expect(v.status).toBe('FAIL');
    expect(v.reason).toBeDefined();
    expect(v.evidence).toBeDefined();
    expect(v.evidence!.length).toBeGreaterThan(0);
  });

  it('43. FAIL verdict evidence contains path and detail', () => {
    const p = tamperIdentityProjection(validAbi(), { roleNote: 'Você é um assistente.' });
    const v = check(p);
    expect(v.status).toBe('FAIL');
    const ev = v.evidence![0]!;
    expect(ev.path).toBeDefined();
    expect(ev.path).toContain('identityProjection');
    expect(ev.detail).toContain('roleplay pattern');
  });

  it('44. measuredAt is a valid ISO date', () => {
    const v = check(validAbi());
    expect(() => new Date(v.measuredAt)).not.toThrow();
    expect(new Date(v.measuredAt).toISOString()).toBe(v.measuredAt);
  });

  it('45. measuredBy is the correct gate identifier', () => {
    const v = makeNoRoleplayGate().check(validAbi());
    expect(v.measuredBy).toBe('no-roleplay.gate');
  });
});
