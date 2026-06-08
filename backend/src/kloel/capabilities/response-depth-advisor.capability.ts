import { Injectable } from '@nestjs/common';
import type {
  ContentKind,
  RequestComplexity,
  ResponseDepthInput,
  ResponseDepthOption,
  ResponseDepthLevel,
  ResponseDepthResult,
} from './kloel-capabilities.types';

/**
 * ResponseDepthAdvisor — deterministic response-length budgeting.
 *
 * Reimplemented by intent from the token-budget / context-budget heuristics:
 * estimate the prompt's token cost, classify request complexity, derive a
 * sensible output-token window, and offer the user four depth tiers (25/50/75/
 * 100%). This lets the Kloel chat proactively ask "versão curta ou detalhada?"
 * and self-cap its own output. Pure arithmetic — no tokenizer, no provider call.
 * Honest about being a heuristic (±15%).
 */
@Injectable()
export class ResponseDepthAdvisorCapability {
  /** Multiplier bands (min, max) per complexity, applied to input tokens. */
  private static readonly MULTIPLIERS: Readonly<Record<RequestComplexity, readonly [number, number]>> =
    {
      simple: [3, 8],
      medium: [8, 20],
      medium_high: [10, 25],
      complex: [15, 40],
      creative: [10, 30],
    };

  private static readonly TIERS: ReadonlyArray<{
    level: ResponseDepthLevel;
    fraction: number;
    label: string;
  }> = [
    { level: 'essential', fraction: 0.25, label: 'Essencial — resposta direta, sem rodeios' },
    { level: 'moderate', fraction: 0.5, label: 'Moderado — resposta com contexto e 1 exemplo' },
    { level: 'detailed', fraction: 0.75, label: 'Detalhado — resposta completa com alternativas' },
    { level: 'exhaustive', fraction: 1, label: 'Exaustivo — tudo, sem limites' },
  ];

  advise(input: ResponseDepthInput): ResponseDepthResult {
    const contentKind = this.detectContentKind(input.prompt);
    const inputTokens = this.estimateTokens(input.prompt, contentKind);
    const complexity = input.complexity ?? this.classifyComplexity(input.prompt);

    const [multMin, multMax] = ResponseDepthAdvisorCapability.MULTIPLIERS[complexity];
    const rawMin = inputTokens * multMin;
    const rawMax = inputTokens * multMax;
    const cap = input.maxOutputTokens && input.maxOutputTokens > 0 ? input.maxOutputTokens : rawMax;
    const maxTokens = Math.max(1, Math.round(Math.min(rawMax, cap)));
    const minTokens = Math.max(1, Math.round(Math.min(rawMin, maxTokens)));

    const options: ResponseDepthOption[] = ResponseDepthAdvisorCapability.TIERS.map((tier) => ({
      level: tier.level,
      fraction: tier.fraction,
      estimatedTokens: Math.round(minTokens + (maxTokens - minTokens) * tier.fraction),
      label: tier.label,
    }));

    return {
      capability: 'response_depth_advisor',
      inputTokens,
      contentKind,
      complexity,
      window: { minTokens, maxTokens },
      options,
      precisionNote: 'Estimativa heurística (~85-90% de precisão, ±15%) — sem tokenizador real.',
      summary: `Prompt ~${inputTokens} tokens, complexidade ${this.complexityLabel(complexity)}. Escolha a profundidade: 25%, 50%, 75% ou 100%.`,
    };
  }

  /**
   * Estimate tokens. Prose: words × 1.3. Code-heavy: chars / 4.
   */
  estimateTokens(text: string, contentKind: ContentKind): number {
    if (text.trim().length === 0) {
      return 0;
    }
    if (contentKind === 'code') {
      return Math.max(1, Math.round(text.length / 4));
    }
    const words = text.trim().split(/\s+/).length;
    return Math.max(1, Math.round(words * 1.3));
  }

  private detectContentKind(text: string): ContentKind {
    const fencedBlocks = (text.match(/```/g) ?? []).length;
    if (fencedBlocks >= 2) {
      return 'code';
    }
    // Heuristic: a high density of code punctuation signals code-heavy content.
    const codeSignals = (text.match(/[{}();=<>[\]]|=>|::|\/\//g) ?? []).length;
    const words = Math.max(1, text.trim().split(/\s+/).length);
    return codeSignals / words > 0.4 ? 'code' : 'prose';
  }

  private classifyComplexity(prompt: string): RequestComplexity {
    const lower = prompt.toLowerCase();
    const wordCount = prompt.trim().split(/\s+/).filter(Boolean).length;

    const creativeSignals =
      /\b(hist[oó]ria|conto|narrativa|poema|ensaio|roteiro|story|essay|narrative|escreva um texto)\b/;
    const complexSignals =
      /\b(compare|comparar|arquitetura|architecture|trade-?off|an[aá]lise|analise|m[uú]ltipl|estrat[eé]gia|migra[cç][aã]o|design system)\b/;
    const mediumHighSignals = /\b(implemente|implement|escreva (uma|um) (fun[cç][aã]o|c[oó]digo)|crie (uma|um) (componente|endpoint|fun[cç][aã]o)|refator)/;
    const mediumSignals = /\b(como|how (does|do|to)|por que|porqu[eê]|explique|explain|funciona)\b/;
    const simpleSignals = /^(o que [eé]|what is|qual|quando|quem|sim ou n[aã]o|yes or no)\b/;

    if (creativeSignals.test(lower)) {
      return 'creative';
    }
    if (complexSignals.test(lower) || wordCount > 60) {
      return 'complex';
    }
    if (mediumHighSignals.test(lower)) {
      return 'medium_high';
    }
    if (simpleSignals.test(lower) && wordCount <= 12) {
      return 'simple';
    }
    if (mediumSignals.test(lower)) {
      return 'medium';
    }
    return wordCount <= 8 ? 'simple' : 'medium';
  }

  private complexityLabel(complexity: RequestComplexity): string {
    switch (complexity) {
      case 'simple':
        return 'simples';
      case 'medium':
        return 'média';
      case 'medium_high':
        return 'média-alta';
      case 'complex':
        return 'complexa';
      case 'creative':
        return 'criativa';
    }
  }
}
