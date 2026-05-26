import { PromptRegistry } from './prompt-registry';
import type { RegisteredPrompt } from './prompt-registry.types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<RegisteredPrompt> = {}): RegisteredPrompt {
  return {
    id: 'assistant.analyze_sentiment.system',
    version: '1.0',
    sha256:
      'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    template: 'Classifique o sentimento.',
    params: [],
    model: 'brain',
    responseFormat: null,
    temperature: 0.0,
    maxTokens: 10,
    changelog: [
      {
        version: '1.0',
        date: '2026-05-01',
        author: 'wave3-audit',
        note: 'Initial extraction.',
      },
    ],
    ...overrides,
  };
}
describe('PromptRegistry', () => {
  let registry: PromptRegistry;

  beforeEach(() => {
    registry = new PromptRegistry();
  });

  // -----------------------------------------------------------------------
  // register
  // -----------------------------------------------------------------------

  describe('register()', () => {
    it('should store a new prompt entry', () => {
      const entry = makeEntry();
      registry.register(entry);

      expect(registry.get(entry.id)).toEqual(entry);
    });

    it('should allow distinct prompts with different ids', () => {
      registry.register(makeEntry({ id: 'a', version: '1.0' }));
      registry.register(makeEntry({ id: 'b', version: '2.3' }));

      expect(registry.list()).toHaveLength(2);
    });

    // -------------------------------------------------------------------
    // version bump (semver)
    // -------------------------------------------------------------------

    it('should accept a minor version bump for the same id', () => {
      registry.register(makeEntry({ id: 'p', version: '1.0' }));
      registry.register(makeEntry({ id: 'p', version: '1.1' }));

      const stored = registry.get('p');
      expect(stored?.version).toBe('1.1');
    });

    it('should accept a major version bump for the same id', () => {
      registry.register(makeEntry({ id: 'p', version: '1.9' }));
      registry.register(makeEntry({ id: 'p', version: '2.0' }));

      const stored = registry.get('p');
      expect(stored?.version).toBe('2.0');
    });

    it('should accept a multi-major bump (1.x → 5.x)', () => {
      registry.register(makeEntry({ id: 'p', version: '1.0' }));
      registry.register(makeEntry({ id: 'p', version: '5.0' }));

      expect(registry.get('p')?.version).toBe('5.0');
    });

    it('should throw when the new version equals the current version', () => {
      registry.register(makeEntry({ id: 'p', version: '2.0' }));

      expect(() => registry.register(makeEntry({ id: 'p', version: '2.0' }))).toThrow(
        /already exists at version 2\.0/,
      );
    });

    it('should throw when the new version is lower than the current version', () => {
      registry.register(makeEntry({ id: 'p', version: '3.0' }));

      expect(() => registry.register(makeEntry({ id: 'p', version: '2.9' }))).toThrow(
        /already exists at version 3\.0/,
      );
    });

    it('should throw when the new version is lower in minor (same major)', () => {
      registry.register(makeEntry({ id: 'p', version: '4.5' }));

      expect(() => registry.register(makeEntry({ id: 'p', version: '4.2' }))).toThrow(
        /already exists at version 4\.5/,
      );
    });

    it('should throw for an invalid semver string (non-numeric major)', () => {
      registry.register(makeEntry({ id: 'p', version: '1.0' }));

      expect(() => registry.register(makeEntry({ id: 'p', version: 'abc.0' }))).toThrow(
        /Invalid semver/,
      );
    });

    it('should throw for an invalid semver string (single segment)', () => {
      registry.register(makeEntry({ id: 'p', version: '1.0' }));

      expect(() => registry.register(makeEntry({ id: 'p', version: '1' }))).toThrow(
        /Invalid semver/,
      );
    });
  });
  // -----------------------------------------------------------------------
  // get
  // -----------------------------------------------------------------------

  describe('get()', () => {
    it('should return the registered prompt by id', () => {
      const entry = makeEntry({ id: 'test.prompt' });
      registry.register(entry);

      expect(registry.get('test.prompt')).toEqual(entry);
    });

    it('should return undefined for an unknown id', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });

    it('should return undefined when the registry is empty', () => {
      expect(registry.get('anything')).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // getById
  // -----------------------------------------------------------------------

  describe('getById()', () => {
    it('should behave identically to get()', () => {
      const entry = makeEntry({ id: 'shared.id' });
      registry.register(entry);

      expect(registry.getById('shared.id')).toEqual(registry.get('shared.id'));
    });

    it('should return undefined for an unknown id (same as get)', () => {
      expect(registry.getById('unknown')).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // list
  // -----------------------------------------------------------------------

  describe('list()', () => {
    it('should return an empty array when no prompts are registered', () => {
      expect(registry.list()).toEqual([]);
    });

    it('should return every registered prompt', () => {
      const a = makeEntry({ id: 'a' });
      const b = makeEntry({ id: 'b' });
      const c = makeEntry({ id: 'c' });

      registry.register(a);
      registry.register(b);
      registry.register(c);

      const all = registry.list();
      expect(all).toHaveLength(3);
      expect(all).toEqual(expect.arrayContaining([a, b, c]));
    });

    it('should return a shallow copy — mutating the result does not affect the registry', () => {
      registry.register(makeEntry({ id: 'p' }));

      const snapshot = registry.list();
      snapshot.pop();

      expect(registry.list()).toHaveLength(1);
    });

    it('should reflect version bumps (latest version wins)', () => {
      registry.register(makeEntry({ id: 'p', version: '1.0' }));
      registry.register(makeEntry({ id: 'p', version: '1.5' }));

      const all = registry.list();
      expect(all).toHaveLength(1);
      expect(all[0]?.version).toBe('1.5');
    });
  });
  // -----------------------------------------------------------------------
  // error on missing id (cross-cutting)
  // -----------------------------------------------------------------------

  describe('error on missing id', () => {
    it('get() returns undefined, not throwing, for missing prompts', () => {
      expect(() => registry.get('missing')).not.toThrow();
      expect(registry.get('missing')).toBeUndefined();
    });

    it('getById() returns undefined, not throwing, for missing prompts', () => {
      expect(() => registry.getById('missing')).not.toThrow();
      expect(registry.getById('missing')).toBeUndefined();
    });

    it('register() throws only on invalid version bump, not on missing id (new entry)', () => {
      // registering a net-new prompt should succeed
      expect(() => registry.register(makeEntry())).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // edge cases
  // -----------------------------------------------------------------------

  describe('edge cases', () => {
    it('should handle zero-padded version segments', () => {
      registry.register(makeEntry({ id: 'p', version: '0.9' }));
      registry.register(makeEntry({ id: 'p', version: '1.0' }));

      expect(registry.get('p')?.version).toBe('1.0');
    });

    it('should treat 0.x → 0.y as valid bump when y > x', () => {
      registry.register(makeEntry({ id: 'p', version: '0.1' }));
      registry.register(makeEntry({ id: 'p', version: '0.2' }));

      expect(registry.get('p')?.version).toBe('0.2');
    });

    it('should reject 0.5 → 0.5 (equal)', () => {
      registry.register(makeEntry({ id: 'p', version: '0.5' }));

      expect(() => registry.register(makeEntry({ id: 'p', version: '0.5' }))).toThrow();
    });

    it('should accept register() with a full prompt object (all fields preserved)', () => {
      const full = makeEntry({
        id: 'full.metadata.prompt',
        version: '2.1',
        params: ['targetLang', 'tone'],
        model: 'fast',
        responseFormat: 'json_object',
        temperature: 0.7,
        maxTokens: 512,
      });
      registry.register(full);

      const stored = registry.get('full.metadata.prompt');
      expect(stored).toEqual(full);
    });
  });
});
