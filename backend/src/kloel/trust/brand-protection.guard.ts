/**
 * UTP-TRUST-005 — Brand Protection Guard
 *
 * Pure function evaluating an outbound message draft for brand-risk
 * patterns: false promises, complaint triggers, pressure tactics,
 * unsubstantiated claims, inappropriate timing.
 *
 * Input: draft text string. Output: BrandRiskFlag[].
 */

import type { BrandRiskFlag } from './trust.types';

interface PatternRule {
  readonly kind: BrandRiskFlag['kind'];
  readonly patterns: readonly RegExp[];
}

const RISK_PATTERNS: readonly PatternRule[] = [
  {
    kind: 'false_promise',
    patterns: [
      /você vai (ganhar|faturar|vender) \d+/gi,
      /resultado em \d+ dias?/gi,
      /sem esforço/gi,
      /dinheiro fácil/gi,
    ],
  },
  {
    kind: 'complaint_trigger',
    patterns: [
      /reclama[çr]/gi,
      /processo/gi,
      /engan/gi,
      /procon/gi,
      /reclame aqui/gi,
      /direito do consumidor/gi,
    ],
  },
  {
    kind: 'pressure_tactic',
    patterns: [
      /última (chance|oportunidade|vaga)/gi,
      /só hoje/gi,
      /vai perder/gi,
      /nunca mais/gi,
      /acabando/gi,
      /estoque (acabando|limitado)/gi,
    ],
  },
  {
    kind: 'unsubstantiated_claim',
    patterns: [
      /todos os (nossos )?clientes/gi,
      /qualquer pessoa/gi,
      /funciona para todo/gi,
      /garantia total/gi,
      /sem risco nenhum/gi,
    ],
  },
  {
    kind: 'inappropriate_timing',
    patterns: [
      /mesmo (de madrugada|domingo|feriado)/gi,
      /a qualquer hora/gi,
    ],
  },
];

export function evaluateBrandRisk(draftText: string): readonly BrandRiskFlag[] {
  const flags: BrandRiskFlag[] = [];

  for (const rule of RISK_PATTERNS) {
    for (const pattern of rule.patterns) {
      const match = pattern.exec(draftText);
      if (match) {
        flags.push({
          kind: rule.kind,
          confidence: Math.min(0.95, 0.5 + match[0].length / 100),
          matchedPattern: pattern.source,
        });
        pattern.lastIndex = 0;
        break;
      }
      pattern.lastIndex = 0;
    }
  }

  return flags;
}
