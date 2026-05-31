import {
  resolveReclaimHumanIdleMinutesExt,
  shouldAutoReclaimHumanLockExt,
} from './inbound-processor.helpers';
import type { ProviderSettings } from './provider-settings.types';

const NOW = Date.parse('2026-05-30T12:00:00.000Z');
const MINUTE = 60_000;

function inboundMsg(ageMinutes: number) {
  return [{ direction: 'INBOUND', createdAt: new Date(NOW - ageMinutes * MINUTE) }];
}

describe('shouldAutoReclaimHumanLockExt', () => {
  const RECLAIM_KEY = 'AUTOPILOT_RECLAIM_HUMAN_LOCK_ON_INBOUND';
  const IDLE_KEY = 'AUTOPILOT_RECLAIM_HUMAN_IDLE_MINUTES';
  const original = {
    reclaim: process.env[RECLAIM_KEY],
    idle: process.env[IDLE_KEY],
  };

  afterEach(() => {
    if (original.reclaim === undefined) {
      delete process.env[RECLAIM_KEY];
    } else {
      process.env[RECLAIM_KEY] = original.reclaim;
    }
    if (original.idle === undefined) {
      delete process.env[IDLE_KEY];
    } else {
      process.env[IDLE_KEY] = original.idle;
    }
  });

  describe('explicit human handoff (mode === HUMAN)', () => {
    it('does NOT reclaim a fresh human handoff (the reported bug)', () => {
      // Customer just messaged; a human explicitly took over moments ago.
      const conversation = {
        mode: 'HUMAN',
        assignedAgentId: 'agent-1',
        lastMessageAt: new Date(NOW),
        messages: inboundMsg(1),
      };
      expect(shouldAutoReclaimHumanLockExt(undefined, conversation, NOW)).toBe(false);
    });

    it('does NOT reclaim a human handoff still inside the idle window', () => {
      // 5h of unanswered inbound, default timeout is 6h.
      const conversation = {
        mode: 'HUMAN',
        assignedAgentId: 'agent-1',
        lastMessageAt: new Date(NOW - 300 * MINUTE),
        messages: inboundMsg(300),
      };
      expect(shouldAutoReclaimHumanLockExt(undefined, conversation, NOW)).toBe(false);
    });

    it('DOES reclaim an abandoned human handoff past the idle window', () => {
      // 7h of unanswered inbound, default timeout is 6h → abandoned.
      const conversation = {
        mode: 'HUMAN',
        assignedAgentId: 'agent-1',
        lastMessageAt: new Date(NOW - 420 * MINUTE),
        messages: inboundMsg(420),
      };
      expect(shouldAutoReclaimHumanLockExt(undefined, conversation, NOW)).toBe(true);
    });

    it('reclaims exactly at the idle boundary', () => {
      const conversation = {
        mode: 'HUMAN',
        assignedAgentId: 'agent-1',
        lastMessageAt: new Date(NOW - 360 * MINUTE),
        messages: inboundMsg(360),
      };
      expect(shouldAutoReclaimHumanLockExt(undefined, conversation, NOW)).toBe(true);
    });

    it('honors a custom AUTOPILOT_RECLAIM_HUMAN_IDLE_MINUTES timeout', () => {
      process.env[IDLE_KEY] = '30';
      const fresh = {
        mode: 'HUMAN',
        assignedAgentId: 'agent-1',
        lastMessageAt: new Date(NOW - 20 * MINUTE),
        messages: inboundMsg(20),
      };
      const stale = {
        mode: 'HUMAN',
        assignedAgentId: 'agent-1',
        lastMessageAt: new Date(NOW - 45 * MINUTE),
        messages: inboundMsg(45),
      };
      expect(shouldAutoReclaimHumanLockExt(undefined, fresh, NOW)).toBe(false);
      expect(shouldAutoReclaimHumanLockExt(undefined, stale, NOW)).toBe(true);
    });

    it('falls back to lastMessageAt when the latest message has no createdAt', () => {
      const conversation = {
        mode: 'HUMAN',
        assignedAgentId: 'agent-1',
        lastMessageAt: new Date(NOW - 420 * MINUTE),
        messages: [{ direction: 'INBOUND', createdAt: null }],
      };
      expect(shouldAutoReclaimHumanLockExt(undefined, conversation, NOW)).toBe(true);
    });

    it('does NOT reclaim when no timestamp is available (cannot prove abandonment)', () => {
      const conversation = {
        mode: 'HUMAN',
        assignedAgentId: 'agent-1',
        lastMessageAt: null,
        messages: [{ direction: 'INBOUND', createdAt: null }],
      };
      expect(shouldAutoReclaimHumanLockExt(undefined, conversation, NOW)).toBe(false);
    });
  });

  describe('agent-assigned but mode !== HUMAN', () => {
    it('reclaims an auto-routed (assigned, AI-mode) conversation on inbound regardless of age', () => {
      const conversation = {
        mode: 'AI',
        assignedAgentId: 'agent-1',
        lastMessageAt: new Date(NOW),
        messages: inboundMsg(1),
      };
      expect(shouldAutoReclaimHumanLockExt(undefined, conversation, NOW)).toBe(true);
    });

    it('does not reclaim an AI-mode conversation with no agent assigned', () => {
      const conversation = {
        mode: 'AI',
        assignedAgentId: null,
        lastMessageAt: new Date(NOW),
        messages: inboundMsg(1),
      };
      expect(shouldAutoReclaimHumanLockExt(undefined, conversation, NOW)).toBe(false);
    });
  });

  describe('hard gates (unchanged behavior)', () => {
    it('never reclaims when the override is disabled', () => {
      process.env[RECLAIM_KEY] = 'false';
      const conversation = {
        mode: 'HUMAN',
        assignedAgentId: 'agent-1',
        lastMessageAt: new Date(NOW - 999 * MINUTE),
        messages: inboundMsg(999),
      };
      expect(shouldAutoReclaimHumanLockExt(undefined, conversation, NOW)).toBe(false);
    });

    it('never reclaims a PAUSED conversation', () => {
      const conversation = {
        mode: 'PAUSED',
        assignedAgentId: 'agent-1',
        lastMessageAt: new Date(NOW - 999 * MINUTE),
        messages: inboundMsg(999),
      };
      expect(shouldAutoReclaimHumanLockExt(undefined, conversation, NOW)).toBe(false);
    });

    it('never reclaims when autonomy is HUMAN_ONLY or SUSPENDED', () => {
      const conversation = {
        mode: 'HUMAN',
        assignedAgentId: 'agent-1',
        lastMessageAt: new Date(NOW - 999 * MINUTE),
        messages: inboundMsg(999),
      };
      const humanOnly: ProviderSettings = { autonomy: { mode: 'HUMAN_ONLY' } };
      const suspended: ProviderSettings = { autonomy: { mode: 'SUSPENDED' } };
      expect(shouldAutoReclaimHumanLockExt(humanOnly, conversation, NOW)).toBe(false);
      expect(shouldAutoReclaimHumanLockExt(suspended, conversation, NOW)).toBe(false);
    });

    it('never reclaims when the latest message is OUTBOUND', () => {
      const conversation = {
        mode: 'HUMAN',
        assignedAgentId: 'agent-1',
        lastMessageAt: new Date(NOW - 999 * MINUTE),
        messages: [{ direction: 'OUTBOUND', createdAt: new Date(NOW - 999 * MINUTE) }],
      };
      expect(shouldAutoReclaimHumanLockExt(undefined, conversation, NOW)).toBe(false);
    });

    it('never reclaims when conversation is null', () => {
      expect(shouldAutoReclaimHumanLockExt(undefined, null, NOW)).toBe(false);
    });
  });
});

describe('resolveReclaimHumanIdleMinutesExt', () => {
  const IDLE_KEY = 'AUTOPILOT_RECLAIM_HUMAN_IDLE_MINUTES';
  const original = process.env[IDLE_KEY];

  afterEach(() => {
    if (original === undefined) {
      delete process.env[IDLE_KEY];
    } else {
      process.env[IDLE_KEY] = original;
    }
  });

  it('defaults to 360 minutes (6h)', () => {
    delete process.env[IDLE_KEY];
    expect(resolveReclaimHumanIdleMinutesExt()).toBe(360);
  });

  it('parses a positive integer override', () => {
    process.env[IDLE_KEY] = '90';
    expect(resolveReclaimHumanIdleMinutesExt()).toBe(90);
  });

  it('falls back to the default for invalid / non-positive values', () => {
    process.env[IDLE_KEY] = '0';
    expect(resolveReclaimHumanIdleMinutesExt()).toBe(360);
    process.env[IDLE_KEY] = '-5';
    expect(resolveReclaimHumanIdleMinutesExt()).toBe(360);
    process.env[IDLE_KEY] = 'not-a-number';
    expect(resolveReclaimHumanIdleMinutesExt()).toBe(360);
  });
});
