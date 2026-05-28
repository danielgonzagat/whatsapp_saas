import { describe, expect, it } from 'vitest';
import {
  flowContextKey,
  flowTimeoutMember,
  NON_DIGIT_RE,
  normalizeUser,
} from '../flow-engine.user-key.helpers';

describe('flow-engine.user-key.helpers', () => {
  describe('normalizeUser', () => {
    it('strips every non-digit character from a phone number string', () => {
      expect(normalizeUser('+55 (11) 99999-1234')).toBe('5511999991234');
    });

    it('passes through an already-digit-only string unchanged', () => {
      expect(normalizeUser('5511999991234')).toBe('5511999991234');
    });

    it('returns empty string for an empty input', () => {
      expect(normalizeUser('')).toBe('');
    });

    it('returns empty string for undefined input', () => {
      expect(normalizeUser(undefined)).toBe('');
    });

    it('returns empty string for null input', () => {
      expect(normalizeUser(null)).toBe('');
    });

    it('returns empty string when input contains no digits at all', () => {
      expect(normalizeUser('+--abc---')).toBe('');
    });

    it('preserves digit order across stripped characters', () => {
      expect(normalizeUser('1a2b3c4')).toBe('1234');
    });

    it('handles unicode whitespace and punctuation', () => {
      expect(normalizeUser('1 2\t3\n4')).toBe('1234');
    });

    it('exports a NON_DIGIT_RE with the global flag (regex state must reset between calls)', () => {
      expect(NON_DIGIT_RE.flags).toContain('g');
      // Ensure repeated calls do not desync — replace() with a global regex
      // would skip matches on alternating calls if state leaked.
      expect(normalizeUser('a1b2')).toBe('12');
      expect(normalizeUser('a1b2')).toBe('12');
    });
  });

  describe('flowContextKey', () => {
    it('returns the workspace-scoped key when a workspaceId is provided', () => {
      expect(flowContextKey('+55 (11) 9999', 'ws_123')).toBe('flow:ws_123:55119999');
    });

    it('returns the legacy bare key when no workspaceId is provided', () => {
      expect(flowContextKey('+55 (11) 9999')).toBe('flow:55119999');
    });

    it('treats an empty workspaceId as missing (falsy => legacy key)', () => {
      expect(flowContextKey('123', '')).toBe('flow:123');
    });

    it('normalises the user before composing the key', () => {
      expect(flowContextKey('user-abc-123', 'ws_x')).toBe('flow:ws_x:123');
    });

    it('keeps workspaceId verbatim (no normalisation, allows arbitrary id shapes)', () => {
      expect(flowContextKey('123', 'ws.with-dots_and_undersc0res')).toBe(
        'flow:ws.with-dots_and_undersc0res:123',
      );
    });

    it('produces flow:<empty> for empty/blank user', () => {
      expect(flowContextKey('')).toBe('flow:');
      expect(flowContextKey('   ')).toBe('flow:');
    });
  });

  describe('flowTimeoutMember', () => {
    it('returns workspace:user when a workspaceId is provided', () => {
      expect(flowTimeoutMember('+55 11 99999-1234', 'ws_alpha')).toBe('ws_alpha:5511999991234');
    });

    it('returns the bare normalised user when no workspaceId is provided', () => {
      expect(flowTimeoutMember('+55 11 99999-1234')).toBe('5511999991234');
    });

    it('treats an empty workspaceId as missing (legacy member shape)', () => {
      expect(flowTimeoutMember('5511', '')).toBe('5511');
    });

    it('normalises the user component before composing the member', () => {
      expect(flowTimeoutMember('user_42', 'ws_y')).toBe('ws_y:42');
    });

    it('round-trips with flowContextKey (same normalisation, different prefix)', () => {
      const raw = '+55 (11) 1234-5678';
      const ws = 'ws_z';
      // The user-suffix in both keys must be identical so the engine's
      // cross-references (ZSET member <-> ContextStore key) stay aligned.
      const ctx = flowContextKey(raw, ws);
      const mem = flowTimeoutMember(raw, ws);
      expect(ctx).toBe(`flow:${mem}`);
    });
  });
});
