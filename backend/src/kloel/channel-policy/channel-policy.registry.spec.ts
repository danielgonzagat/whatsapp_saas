import { ChannelPolicyRegistry } from './channel-policy.registry';
import type { ChannelTerminalPolicy } from './channel-policy.types';

/**
 * UTP-CHANNEL-POLICY contract spec — per-channel terminal valence + truthMode.
 *
 * Verifies:
 *   - Built-in policies exist for whatsapp, web, email, ads.
 *   - get() resolves by channel name.
 *   - applyTo() fills defaults for matching events.
 *   - Explicit values are never overwritten.
 *   - Unknown events pass through unchanged.
 *   - applyToChannel() provides direct-channel access.
 *   - Custom policies can be injected at construction.
 */

const WHATSAPP_MESSAGE_RECEIVED = 'commerce.whatsapp.message_received';
const WHATSAPP_HANDOFF = 'commerce.whatsapp.handoff_to_human';
const WHATSAPP_SESSION = 'commerce.whatsapp.session_lifecycle';
const CART_ABANDONED = 'commerce.cart.abandoned';
const UNKNOWN_EVENT = 'commerce.something.unknown';

function build(injected?: Record<string, ChannelTerminalPolicy>) {
  return new ChannelPolicyRegistry(injected);
}

describe('ChannelPolicyRegistry', () => {
  describe('built-in policies', () => {
    it('has a policy for whatsapp', () => {
      const registry = build();
      const policy = registry.get('whatsapp');
      expect(policy).toBeDefined();
      expect(policy!.channelName).toBe('whatsapp');
    });

    it('has a policy for web', () => {
      const registry = build();
      const policy = registry.get('web');
      expect(policy).toBeDefined();
      expect(policy!.channelName).toBe('web');
    });

    it('has a policy for email', () => {
      const registry = build();
      const policy = registry.get('email');
      expect(policy).toBeDefined();
      expect(policy!.channelName).toBe('email');
    });

    it('has a policy for ads', () => {
      const registry = build();
      const policy = registry.get('ads');
      expect(policy).toBeDefined();
      expect(policy!.channelName).toBe('ads');
    });
  });

  describe('get', () => {
    it('returns undefined for unknown channel', () => {
      const registry = build();
      expect(registry.get('nonexistent')).toBeUndefined();
    });

    it('whatsapp policy declares expected terminal events', () => {
      const registry = build();
      const policy = registry.get('whatsapp')!;
      expect(policy.terminalEventNames).toContain(WHATSAPP_MESSAGE_RECEIVED);
      expect(policy.terminalEventNames).toContain(WHATSAPP_HANDOFF);
      expect(policy.terminalEventNames).toContain(WHATSAPP_SESSION);
    });

    it('whatsapp policy has default valence for message_received', () => {
      const registry = build();
      const policy = registry.get('whatsapp')!;
      expect(policy.defaultValenceByName[WHATSAPP_MESSAGE_RECEIVED]).toBe('neutral');
    });

    it('whatsapp policy has default valence for handoff_to_human', () => {
      const registry = build();
      const policy = registry.get('whatsapp')!;
      expect(policy.defaultValenceByName[WHATSAPP_HANDOFF]).toBe('negative');
    });

    it('whatsapp policy has default truthMode for terminal events', () => {
      const registry = build();
      const policy = registry.get('whatsapp')!;
      expect(policy.defaultTruthModeByName[WHATSAPP_MESSAGE_RECEIVED]).toBe('observed');
      expect(policy.defaultTruthModeByName[WHATSAPP_HANDOFF]).toBe('observed');
    });
  });

  describe('snapshot', () => {
    it('returns all four built-in channels', () => {
      const registry = build();
      const snap = registry.snapshot();
      expect(Object.keys(snap)).toHaveLength(4);
      expect(snap['whatsapp']).toBeDefined();
      expect(snap['web']).toBeDefined();
      expect(snap['email']).toBeDefined();
      expect(snap['ads']).toBeDefined();
    });
  });

  describe('channelNames', () => {
    it('returns the four channel names', () => {
      const registry = build();
      const names = registry.channelNames();
      expect(names).toHaveLength(4);
      expect(names).toContain('whatsapp');
      expect(names).toContain('web');
      expect(names).toContain('email');
      expect(names).toContain('ads');
    });
  });

  describe('applyTo', () => {
    it('fills valence from policy when absent', () => {
      const registry = build();
      const result = registry.applyTo({ eventName: WHATSAPP_MESSAGE_RECEIVED });
      expect(result.valence).toBe('neutral');
    });

    it('fills truthMode from policy when absent', () => {
      const registry = build();
      const result = registry.applyTo({ eventName: WHATSAPP_MESSAGE_RECEIVED });
      expect(result.truthMode).toBe('observed');
    });

    it('fills both valence and truthMode when both absent', () => {
      const registry = build();
      const result = registry.applyTo({ eventName: WHATSAPP_HANDOFF });
      expect(result.valence).toBe('negative');
      expect(result.truthMode).toBe('observed');
    });

    it('does not overwrite explicit valence', () => {
      const registry = build();
      const result = registry.applyTo({
        eventName: WHATSAPP_MESSAGE_RECEIVED,
        valence: 'positive',
      });
      expect(result.valence).toBe('positive');
    });

    it('does not overwrite explicit truthMode', () => {
      const registry = build();
      const result = registry.applyTo({
        eventName: WHATSAPP_MESSAGE_RECEIVED,
        truthMode: 'inferred',
      });
      expect(result.truthMode).toBe('inferred');
    });

    it('preserves both explicit valence and truthMode', () => {
      const registry = build();
      const result = registry.applyTo({
        eventName: WHATSAPP_MESSAGE_RECEIVED,
        valence: 'ambiguous',
        truthMode: 'projected',
      });
      expect(result.valence).toBe('ambiguous');
      expect(result.truthMode).toBe('projected');
    });

    it('returns event unchanged when eventName not in any policy', () => {
      const registry = build();
      const result = registry.applyTo({ eventName: UNKNOWN_EVENT });
      expect(result.valence).toBeUndefined();
      expect(result.truthMode).toBeUndefined();
      expect(result.eventName).toBe(UNKNOWN_EVENT);
    });

    it('fills defaults for web channel events', () => {
      const registry = build();
      const result = registry.applyTo({ eventName: CART_ABANDONED });
      expect(result.valence).toBe('negative');
      expect(result.truthMode).toBe('inferred');
    });

    it('handles event with truthMode set but missing valence', () => {
      const registry = build();
      const result = registry.applyTo({
        eventName: CART_ABANDONED,
        truthMode: 'observed',
      });
      expect(result.truthMode).toBe('observed');
      expect(result.valence).toBe('negative');
    });

    it('handles event with valence set but missing truthMode', () => {
      const registry = build();
      const result = registry.applyTo({
        eventName: CART_ABANDONED,
        valence: 'ambiguous',
      });
      expect(result.valence).toBe('ambiguous');
      expect(result.truthMode).toBe('inferred');
    });
  });

  describe('applyToChannel', () => {
    it('fills defaults for a specific channel', () => {
      const registry = build();
      const result = registry.applyToChannel('whatsapp', {
        eventName: WHATSAPP_MESSAGE_RECEIVED,
      });
      expect(result.valence).toBe('neutral');
      expect(result.truthMode).toBe('observed');
    });

    it('ignores event not in the channels terminal list', () => {
      const registry = build();
      const result = registry.applyToChannel('whatsapp', {
        eventName: CART_ABANDONED,
      });
      expect(result.valence).toBeUndefined();
      expect(result.truthMode).toBeUndefined();
    });

    it('returns event unchanged for unknown channel', () => {
      const registry = build();
      const result = registry.applyToChannel('unknown', {
        eventName: WHATSAPP_MESSAGE_RECEIVED,
      });
      expect(result.valence).toBeUndefined();
      expect(result.truthMode).toBeUndefined();
    });
  });

  describe('custom policy injection', () => {
    it('uses injected policies instead of built-ins', () => {
      const custom: Record<string, ChannelTerminalPolicy> = {
        slack: {
          channelName: 'slack',
          terminalEventNames: ['commerce.whatsapp.message_received'],
          defaultValenceByName: { 'commerce.whatsapp.message_received': 'positive' },
          defaultTruthModeByName: { 'commerce.whatsapp.message_received': 'inferred' },
        },
      };
      const registry = build(custom);
      expect(registry.get('whatsapp')).toBeUndefined();
      expect(registry.get('slack')).toBeDefined();
      const result = registry.applyTo({ eventName: 'commerce.whatsapp.message_received' });
      expect(result.valence).toBe('positive');
    });

    it('uses built-ins when injected map is empty', () => {
      const registry = build({});
      expect(registry.get('whatsapp')).toBeDefined();
      expect(registry.channelNames()).toHaveLength(4);
    });
  });
});
