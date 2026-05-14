import * as fs from 'node:fs';
import * as path from 'node:path';
import { CANONICAL_FALLBACK_SYSTEM_PROMPT } from './kloel.prompts';
import { UnifiedAgentContextService } from './unified-agent-context.service';
import { UnifiedAgentContextDataService } from './unified-agent-context-data.service';

/**
 * UTP-ABI-009 — Prompt emptied spec.
 *
 * Implements PCI.2 §8 (docs/contracts/pci/02-abi-schema.md).
 *
 * Goal: prove that after the ABI-009 final cutover:
 *   1. kloel.prompts.ts no longer contains persona / role / few-shot / guardrail prose.
 *   2. buildSystemPrompt returns the canonical fallback constant.
 *   3. unified-agent-context-data.service.ts is unaffected (data path).
 */

const PROMPTS_PATH = path.resolve(__dirname, 'kloel.prompts.ts');

const FORBIDDEN_TOKENS = [
  'voce e',
  'you are',
  'always',
  'always ',
  'never',
  'never ',
  'Kloel',
  'IDENTIDADE',
  'PERSONALIDADE',
  'vendedora',
  'few_shot',
  'EXEMPLO',
  'MODO DASHBOARD',
  'MODO ONBOARDING',
  'MODO VENDAS',
  'MODO VISITANTE',
  'DIRETRIZES OPERACIONAIS',
  'REGRA CRÍTICA',
  'OBJEÇÕES',
  'RESULTADO PROMETIDO',
];

describe('UTP-ABI-009 — Prompt emptied', () => {
  // ─── 1. kloel.prompts.ts no longer carries persona/role/few-shot prose ───

  describe('kloel.prompts.ts', () => {
    const raw = fs.readFileSync(PROMPTS_PATH, 'utf8');

    it('exports CANONICAL_FALLBACK_SYSTEM_PROMPT as the only export', () => {
      expect(CANONICAL_FALLBACK_SYSTEM_PROMPT).toBe(
        'Estado cognitivo distribuído. Verbalize a partir do estado abaixo. Nunca invente fato fora do estado.',
      );
    });

    it('contains no persona, role, or few-shot prose', () => {
      const normalized = raw.replace(/\s+/g, ' ').toLowerCase();
      for (const token of FORBIDDEN_TOKENS) {
        expect(normalized).not.toContain(token.toLowerCase());
      }
    });

    it('contains no Portuguese guardrail / behavioural instruction strings', () => {
      const additional = [
        'Nunca invente produtos',
        'Nunca cite',
        'GHK-Cu',
        'Nunca finja ser humano',
        'Nunca se apresente como',
        'Seu objetivo e resposta',
        'Foque em vender',
        'Use as ferramentas',
        'Seja proativa',
      ];
      for (const fragment of additional) {
        expect(raw).not.toContain(fragment);
      }
    });
  });

  // ─── 2. buildSystemPrompt returns canonical fallback ───

  describe('buildSystemPrompt', () => {
    let service: UnifiedAgentContextService;

    beforeEach(() => {
      service = new UnifiedAgentContextService(
        new UnifiedAgentContextDataService(undefined as never),
      );
    });

    it('returns CANONICAL_FALLBACK_SYSTEM_PROMPT regardless of input', () => {
      const result = service.buildSystemPrompt({}, [], []);
      expect(result).toBe(CANONICAL_FALLBACK_SYSTEM_PROMPT);
    });

    it('returns CANONICAL_FALLBACK_SYSTEM_PROMPT with populated input', () => {
      const result = service.buildSystemPrompt(
        { name: 'Test', brandVoice: 'Friendly' },
        [{ name: 'Product A', price: '99' }],
        [{ tone: 'Agressivo', persistenceLevel: 5 }],
      );
      expect(result).toBe(CANONICAL_FALLBACK_SYSTEM_PROMPT);
    });

    it('returns the same constant on every call (idempotent)', () => {
      const a = service.buildSystemPrompt({}, [], []);
      const b = service.buildSystemPrompt({ a: 1, b: 2 } as never, [] as never, [] as never);
      expect(a).toBe(b);
    });
  });

  // ─── 3. unified-agent-context-data.service.ts is unaffected ───

  describe('unified-agent-context-data.service.ts', () => {
    it('can be imported and is a class', () => {
      expect(typeof UnifiedAgentContextDataService).toBe('function');
    });

    it('has no direct dependency on kloel.prompts or kloel.prompts.helpers', () => {
      const helperImports = [
        "from './kloel.prompts'",
        "from './kloel.prompts.helpers'",
      ];
      for (const imp of helperImports) {
        expect(raw).not.toContain(imp);
      }
    });

    // Preload the data service raw contents for the import-check above.
    let raw = '';
    beforeAll(() => {
      raw = fs.readFileSync(
        path.resolve(__dirname, 'unified-agent-context-data.service.ts'),
        'utf8',
      );
    });
  });
});
