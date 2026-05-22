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
const OBJECTION_RAISED = 'commerce.lead.objection_raised';
const WENT_SILENT = 'commerce.lead.went_silent';
const CONVERSATION_RESUMED = 'commerce.whatsapp.conversation_resumed';
const FIRST_VALUE_OBTAINED = 'commerce.post_sale.first_value_obtained';
const SATISFACTION_SIGNAL = 'commerce.post_sale.satisfaction_signal_observed';
const CHURN_RISK_DETECTED = 'commerce.post_sale.churn_risk_detected';
const REPURCHASE_WINDOW_OPENED = 'commerce.post_sale.repurchase_window_opened';
const WIN_BACK_WINDOW_OPENED = 'commerce.post_sale.win_back_window_opened';
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

    it('has a policy for post_sale', () => {
      const registry = build();
      const policy = registry.get('post_sale');
      expect(policy).toBeDefined();
      expect(policy!.channelName).toBe('post_sale');
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
      expect(policy.terminalEventNames).toHaveLength(6);
      expect(policy.terminalEventNames).toContain(WHATSAPP_MESSAGE_RECEIVED);
      expect(policy.terminalEventNames).toContain(WHATSAPP_HANDOFF);
      expect(policy.terminalEventNames).toContain(WHATSAPP_SESSION);
      expect(policy.terminalEventNames).toContain(OBJECTION_RAISED);
      expect(policy.terminalEventNames).toContain(WENT_SILENT);
      expect(policy.terminalEventNames).toContain(CONVERSATION_RESUMED);
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

    it('whatsapp policy defaults objection_raised as negative/inferred', () => {
      const registry = build();
      const policy = registry.get('whatsapp')!;
      expect(policy.defaultValenceByName[OBJECTION_RAISED]).toBe('negative');
      expect(policy.defaultTruthModeByName[OBJECTION_RAISED]).toBe('inferred');
    });

    it('whatsapp policy defaults went_silent as negative/inferred', () => {
      const registry = build();
      const policy = registry.get('whatsapp')!;
      expect(policy.defaultValenceByName[WENT_SILENT]).toBe('negative');
      expect(policy.defaultTruthModeByName[WENT_SILENT]).toBe('inferred');
    });

    it('whatsapp policy defaults conversation_resumed as positive/observed', () => {
      const registry = build();
      const policy = registry.get('whatsapp')!;
      expect(policy.defaultValenceByName[CONVERSATION_RESUMED]).toBe('positive');
      expect(policy.defaultTruthModeByName[CONVERSATION_RESUMED]).toBe('observed');
    });

    it('post_sale policy declares expected journey terminal events', () => {
      const registry = build();
      const policy = registry.get('post_sale')!;
      expect(policy.terminalEventNames).toContain(FIRST_VALUE_OBTAINED);
      expect(policy.terminalEventNames).toContain(SATISFACTION_SIGNAL);
      expect(policy.terminalEventNames).toContain(CHURN_RISK_DETECTED);
      expect(policy.terminalEventNames).toContain(REPURCHASE_WINDOW_OPENED);
      expect(policy.terminalEventNames).toContain(WIN_BACK_WINDOW_OPENED);
    });

    it('post_sale policy defaults first value and churn with honest valence', () => {
      const registry = build();
      const policy = registry.get('post_sale')!;
      expect(policy.defaultValenceByName[FIRST_VALUE_OBTAINED]).toBe('positive');
      expect(policy.defaultTruthModeByName[FIRST_VALUE_OBTAINED]).toBe('inferred');
      expect(policy.defaultValenceByName[CHURN_RISK_DETECTED]).toBe('negative');
      expect(policy.defaultTruthModeByName[CHURN_RISK_DETECTED]).toBe('inferred');
    });

    it('post_sale policy keeps repurchase window neutral because it still requires judgment', () => {
      const registry = build();
      const policy = registry.get('post_sale')!;
      expect(policy.defaultValenceByName[REPURCHASE_WINDOW_OPENED]).toBe('neutral');
      expect(policy.defaultTruthModeByName[REPURCHASE_WINDOW_OPENED]).toBe('inferred');
    });
  });

  describe('snapshot', () => {
    it('returns all five built-in channels', () => {
      const registry = build();
      const snap = registry.snapshot();
      expect(Object.keys(snap)).toHaveLength(5);
      expect(snap['whatsapp']).toBeDefined();
      expect(snap['web']).toBeDefined();
      expect(snap['email']).toBeDefined();
      expect(snap['ads']).toBeDefined();
      expect(snap['post_sale']).toBeDefined();
    });
  });

  describe('channelNames', () => {
    it('returns the five channel names', () => {
      const registry = build();
      const names = registry.channelNames();
      expect(names).toHaveLength(5);
      expect(names).toContain('whatsapp');
      expect(names).toContain('web');
      expect(names).toContain('email');
      expect(names).toContain('ads');
      expect(names).toContain('post_sale');
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

    it('returns event unchanged when eventName not in a matching policy', () => {
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

    it('fills negative/inferred for objection_raised with no explicit fields', () => {
      const registry = build();
      const result = registry.applyTo({ eventName: OBJECTION_RAISED });
      expect(result.valence).toBe('negative');
      expect(result.truthMode).toBe('inferred');
    });

    it('fills negative/inferred for went_silent with no explicit fields', () => {
      const registry = build();
      const result = registry.applyTo({ eventName: WENT_SILENT });
      expect(result.valence).toBe('negative');
      expect(result.truthMode).toBe('inferred');
    });

    it('fills positive/observed for conversation_resumed with no explicit fields', () => {
      const registry = build();
      const result = registry.applyTo({ eventName: CONVERSATION_RESUMED });
      expect(result.valence).toBe('positive');
      expect(result.truthMode).toBe('observed');
    });

    it('does not overwrite explicit valence on objection_raised', () => {
      const registry = build();
      const result = registry.applyTo({
        eventName: OBJECTION_RAISED,
        valence: 'ambiguous',
      });
      expect(result.valence).toBe('ambiguous');
      expect(result.truthMode).toBe('inferred');
    });

    it('does not overwrite explicit truthMode on went_silent', () => {
      const registry = build();
      const result = registry.applyTo({
        eventName: WENT_SILENT,
        truthMode: 'projected',
      });
      expect(result.valence).toBe('negative');
      expect(result.truthMode).toBe('projected');
    });

    it('preserves both explicit valence and truthMode on conversation_resumed', () => {
      const registry = build();
      const result = registry.applyTo({
        eventName: CONVERSATION_RESUMED,
        valence: 'neutral',
        truthMode: 'inferred',
      });
      expect(result.valence).toBe('neutral');
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
      expect(registry.channelNames()).toHaveLength(5);
    });
  });
});
