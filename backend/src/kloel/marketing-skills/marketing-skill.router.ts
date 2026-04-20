import { Injectable } from '@nestjs/common';
import { MARKETING_SKILL_CATALOG } from './marketing-skill.catalog';
import type { MarketingSkillCatalogEntry, MarketingSkillRouteHit } from './marketing-skill.types';

const DIACRITICS_RE = /[\u0300-\u036f]/g;
const NON_WORD_RE = /[^a-z0-9\s/+-]+/g;
const SPACE_RE = /\s+/g;

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(DIACRITICS_RE, '')
    .toLowerCase()
    .replace(NON_WORD_RE, ' ')
    .replace(SPACE_RE, ' ')
    .trim();
}

function containsAny(text: string, variants: string[]): boolean {
  return variants.some((variant) => text.includes(normalizeText(variant)));
}

/**
 * Keyword vocabulary that flips the router into "marketing intent" mode.
 * Kept as a module-level readonly constant so `isMarketingRequest` stays at
 * a trivial NLOC — Lizard counts every array element on its own line.
 */
const MARKETING_INTENT_KEYWORDS: readonly string[] = [
  'marketing',
  'copy',
  'landing',
  'homepage',
  'seo',
  'trafego pago',
  'meta ads',
  'google ads',
  'roas',
  'checkout',
  'conversao',
  'campanha',
  'afiliado',
  'afiliados',
  'lançamento',
  'lancamento',
  'precificacao',
  'preco',
  'churn',
  'email',
  'funil',
  'whatsapp marketing',
];

/** Marketing skill router. */
@Injectable()
export class MarketingSkillRouter {
  /** Is marketing request. */
  isMarketingRequest(message: string): boolean {
    const normalized = normalizeText(message);
    if (!normalized) {
      return false;
    }
    return containsAny(normalized, [...MARKETING_INTENT_KEYWORDS]);
  }

  /** Route. */
  route(message: string): MarketingSkillRouteHit[] {
    const normalized = normalizeText(message);
    if (!normalized) {
      return [];
    }

    const hits = MARKETING_SKILL_CATALOG.map((entry) => this.scoreEntry(normalized, entry)).filter(
      (entry): entry is MarketingSkillRouteHit => entry !== null,
    );

    this.applyCompositeRules(normalized, hits);

    return Array.from(
      new Map(
        hits.sort((left, right) => right.score - left.score).map((hit) => [hit.id, hit]),
      ).values(),
    ).slice(0, 4);
  }

  private scoreEntry(
    text: string,
    entry: MarketingSkillCatalogEntry,
  ): MarketingSkillRouteHit | null {
    let score = 0;
    const reasons: string[] = [];

    for (const keyword of entry.keywords) {
      const normalizedKeyword = normalizeText(keyword);
      if (!normalizedKeyword || normalizedKeyword.length < 2) {
        continue;
      }
      if (!text.includes(normalizedKeyword)) {
        continue;
      }

      score += normalizedKeyword.includes(' ') ? 3 : 2;
      reasons.push(keyword);
    }

    if (score <= 0) {
      return null;
    }

    return {
      id: entry.id,
      score,
      reasons: Array.from(new Set(reasons)).slice(0, 4),
    };
  }

  private applyCompositeRules(text: string, hits: MarketingSkillRouteHit[]) {
    const ensureHit = (id: string, score: number, reason: string) => {
      const existing = hits.find((entry) => entry.id === id);
      if (existing) {
        existing.score += score;
        if (!existing.reasons.includes(reason)) {
          existing.reasons.push(reason);
        }
        return;
      }

      hits.push({ id, score, reasons: [reason] });
    };

    if (
      containsAny(text, ['checkout', 'abandono', 'conversao baixa', 'conversao']) &&
      containsAny(text, ['pagina', 'copy', 'cta', 'formulario', 'campo'])
    ) {
      ensureHit('page-cro', 5, 'checkout/page conversion');
      ensureHit('form-cro', 3, 'checkout/form friction');
    }

    if (
      containsAny(text, ['checkout']) &&
      containsAny(text, ['baixa', 'caiu', 'ruim', 'abandon'])
    ) {
      ensureHit('page-cro', 4, 'checkout conversion drop');
    }

    if (containsAny(text, ['lancamento', 'lancar', 'pre lancamento', 'aquecimento'])) {
      ensureHit('launch-strategy', 5, 'launch planning');
      ensureHit('email-sequence', 2, 'launch messaging');
    }

    if (
      containsAny(text, ['meta ads', 'google ads', 'roas', 'cpa', 'trafego pago', 'campanha paga'])
    ) {
      ensureHit('paid-ads', 5, 'paid acquisition');
      ensureHit('ad-creative', 2, 'creative iteration');
    }

    if (containsAny(text, ['homepage', 'hero', 'pagina de vendas', 'landing'])) {
      ensureHit('copywriting', 3, 'page copy');
      ensureHit('page-cro', 3, 'page conversion');
    }

    if (containsAny(text, ['seo', 'blog', 'organico', 'organic'])) {
      ensureHit('seo-audit', 4, 'seo request');
      ensureHit('site-architecture', 2, 'seo structure');
    }

    if (containsAny(text, ['afiliado', 'afiliados', 'indicacao', 'referral'])) {
      ensureHit('referral-program', 5, 'affiliate motion');
    }

    if (containsAny(text, ['precificacao', 'preco', 'planos', 'ticket', 'mensal', 'anual'])) {
      ensureHit('pricing-strategy', 5, 'pricing request');
    }

    if (containsAny(text, ['teste a/b', 'ab test', 'teste ab', 'experimento'])) {
      ensureHit('ab-test-setup', 5, 'experiment design');
    }

    if (containsAny(text, ['churn', 'cancelamento', 'reter', 'retencao'])) {
      ensureHit('churn-prevention', 5, 'retention request');
    }

    if (
      containsAny(text, ['email', 'sequencia', 'recuperacao de carrinho', 'carrinho abandonado'])
    ) {
      ensureHit('email-sequence', 4, 'email/lifecycle');
    }
  }
}
