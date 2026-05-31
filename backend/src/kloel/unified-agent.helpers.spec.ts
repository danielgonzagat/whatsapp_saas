import {
  UNIFIED_AGENT_PROVIDER_CONFIG_REQUIRED,
  actionSucceeded,
  formatPromptValue,
  isAllowedTool,
} from './unified-agent.helpers';

describe('unified-agent.helpers', () => {
  describe('UNIFIED_AGENT_PROVIDER_CONFIG_REQUIRED', () => {
    it('exposes the configuration-required sentinel', () => {
      expect(UNIFIED_AGENT_PROVIDER_CONFIG_REQUIRED).toBe(
        'Primary LLM configuration is required for unified agent generation',
      );
    });
  });

  describe('isAllowedTool', () => {
    it('allows every tool when allowlist is undefined', () => {
      expect(isAllowedTool('anything')).toBe(true);
    });

    it('denies every tool when allowlist is empty', () => {
      expect(isAllowedTool('send_message', [])).toBe(false);
    });

    it('allows tools present in the allowlist', () => {
      expect(isAllowedTool('send_message', ['send_message', 'update_lead'])).toBe(true);
    });

    it('denies tools missing from the allowlist', () => {
      expect(isAllowedTool('delete_workspace', ['send_message'])).toBe(false);
    });
  });

  describe('formatPromptValue', () => {
    it('serializes null as the literal "null"', () => {
      expect(formatPromptValue(null)).toBe('null');
    });

    it('serializes undefined as the literal "undefined"', () => {
      expect(formatPromptValue(undefined)).toBe('undefined');
    });

    it('serializes primitives by string coercion', () => {
      expect(formatPromptValue(42)).toBe('42');
      expect(formatPromptValue(true)).toBe('true');
      expect(formatPromptValue(false)).toBe('false');
      // Use the string-literal BigInt constructor so the value survives JS
      // number-precision (>2^53) before it ever reaches the helper.
      expect(formatPromptValue(BigInt('9007199254740993'))).toBe('9007199254740993');
    });

    it('double-quotes and escapes strings', () => {
      expect(formatPromptValue('hello')).toBe('"hello"');
      expect(formatPromptValue('she said "hi"')).toBe('"she said \\"hi\\""');
      expect(formatPromptValue('path\\to\\file')).toBe('"path\\\\to\\\\file"');
    });

    it('serializes arrays preserving element order', () => {
      expect(formatPromptValue([1, 'two', null])).toBe('[1,"two",null]');
    });

    it('serializes objects with alphabetically sorted keys', () => {
      // Same data, different key order → same output (cache-stable).
      const a = formatPromptValue({ b: 1, a: 2 });
      const b = formatPromptValue({ a: 2, b: 1 });
      expect(a).toBe('{a:2,b:1}');
      expect(a).toBe(b);
    });

    it('serializes nested arrays and objects recursively', () => {
      expect(formatPromptValue({ list: [{ k: 'v' }, 2] })).toBe('{list:[{k:"v"},2]}');
    });

    it('falls back to Object.prototype.toString for unsupported types', () => {
      // Functions are not handled by any explicit branch; the helper falls
      // through to Object.prototype.toString.call which yields [object Function].
      const fn = () => 1;
      expect(formatPromptValue(fn)).toBe('[object Function]');
      expect(formatPromptValue(Symbol('x'))).toBe('[object Symbol]');
    });
  });

  describe('actionSucceeded', () => {
    it('returns false for null and primitives', () => {
      expect(actionSucceeded(null)).toBe(false);
      expect(actionSucceeded(undefined)).toBe(false);
      expect(actionSucceeded(true)).toBe(false);
      expect(actionSucceeded('success')).toBe(false);
    });

    it('returns true when success === true', () => {
      expect(actionSucceeded({ success: true })).toBe(true);
    });

    it('returns true when ok === true', () => {
      expect(actionSucceeded({ ok: true })).toBe(true);
    });

    it('returns true when executed === true', () => {
      expect(actionSucceeded({ executed: true })).toBe(true);
    });

    it('returns false when all success-signal fields are false or absent', () => {
      expect(actionSucceeded({})).toBe(false);
      expect(actionSucceeded({ success: false, ok: false, executed: false })).toBe(false);
      expect(actionSucceeded({ data: { success: true } })).toBe(false);
    });

    it('rejects truthy-but-non-true success values', () => {
      // Helper is strict on `=== true` to avoid leaky truthiness from data fields.
      expect(actionSucceeded({ success: 1 })).toBe(false);
      expect(actionSucceeded({ ok: 'yes' })).toBe(false);
    });
  });
});
