/**
 * MercadoEntradaDeclaratorService — Mercado de Entrada Ativo.
 *
 * Declares and exposes the single active entry market for the Kloel
 * product as a whole. An entry market is a dominant combination of:
 *   role (Camada XXIII) + stage (Camada VIII) +
 *   business type + flagship journey.
 *
 * Stores an immutable ranked list of 5 entry market candidates and
 * declares ONE as the active market. Every declaration (including
 * initialisation) emits a `commerce.onboarding.declared` spine event
 * with full provenance.
 *
 * Types are co-located here as the single source of truth for the
 * entry market concept. No separate types file — this service IS
 * the canonical contract.
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Role } from '../role/types';
import type { MaturityStage } from '../maturity/maturity.types';
import type { SpineEmitterService } from '../spine/spine-emitter.service';
// =========================================================================
// TYPES
// =========================================================================
export type BusinessType = 'infoproduto' | 'servico' | 'consultoria' | 'ecommerce' | 'saas' | 'agencia' | 'educacao';
export const ALL_BUSINESS_TYPES: readonly BusinessType[] = [
  'infoproduto',
  'servico',
  'consultoria',
  'ecommerce',
  'saas',
  'agencia',
  'educacao',
] as const;
export type FlagshipJourney =
  | 'checkout_direto'
  | 'whatsapp_vendas'
  | 'lancamento'
  | 'afiliacao'
  | 'indicacao'
  | 'consultivo'
  | 'conteudo_pago'
  | 'assinatura';
export const ALL_FLAGSHIP_JOURNEYS: readonly FlagshipJourney[] = [
  'checkout_direto',
  'whatsapp_vendas',
  'lancamento',
  'afiliacao',
  'indicacao',
  'consultivo',
  'conteudo_pago',
  'assinatura',
] as const;
export interface EntryMarket {
  readonly marketId: string;
  readonly label: string;
  readonly role: Role;
  readonly stage: MaturityStage;
  readonly businessType: BusinessType;
  readonly flagshipJourney: FlagshipJourney;
  readonly rationale: string;
}
export interface EntryMarketCandidate extends EntryMarket {
  readonly payablePainSize: number;
  readonly n4plusProofSpeed: number;
  readonly adoptionFriction: number;
  readonly spontaneousReferral: number;
  readonly indispensability: number;
  readonly compositeScore: number;
  readonly rank: number;
}
export interface EntryMarketDeclaration {
  readonly active: EntryMarket;
  readonly declaredAt: string;
  readonly declaredBy: string;
  readonly previousMarketId?: string;
  readonly eventId: string;
}
export interface DeclareResult {
  readonly ok: boolean;
  readonly declaration: EntryMarketDeclaration;
  readonly error?: string;
}
export interface EntryMarketRanking {
  readonly candidates: readonly EntryMarketCandidate[];
  readonly active: EntryMarket;
  readonly rankedAt: string;
}
// =========================================================================
// SCORING WEIGHTS
// =========================================================================
export const SCORING_WEIGHTS = {
  payablePainSize: 0.25,
  n4plusProofSpeed: 0.25,
  adoptionFriction: 0.2,
  spontaneousReferral: 0.15,
  indispensability: 0.15,
} as const;
export function computeCompositeScore(
  payablePainSize: number,
  n4plusProofSpeed: number,
  adoptionFriction: number,
  spontaneousReferral: number,
  indispensability: number,
): number {
  return (
    payablePainSize * SCORING_WEIGHTS.payablePainSize +
    n4plusProofSpeed * SCORING_WEIGHTS.n4plusProofSpeed +
    adoptionFriction * SCORING_WEIGHTS.adoptionFriction +
    spontaneousReferral * SCORING_WEIGHTS.spontaneousReferral +
    indispensability * SCORING_WEIGHTS.indispensability
  );
}
// =========================================================================
// CANDIDATES — ranked by compositeScore desc
// =========================================================================
export const ENTRY_MARKET_CANDIDATES: readonly EntryMarketCandidate[] = [
  {
    marketId: 'produtor-infoproduto-validacao-checkout',
    label: 'Produtor de Infoproduto em Validação via Checkout Direto',
    role: 'produtor',
    stage: 'validacao',
    businessType: 'infoproduto',
    flagshipJourney: 'checkout_direto',
    rationale:
      'Caminho mais curto entre signup e primeira receita. Produto → checkout → pagamento. Fluxo linear, dor aguda, prova rápida.',
    payablePainSize: 0.9,
    n4plusProofSpeed: 0.95,
    adoptionFriction: 0.95,
    spontaneousReferral: 0.85,
    indispensability: 0.9,
    compositeScore: computeCompositeScore(0.9, 0.95, 0.95, 0.85, 0.9),
    rank: 1,
  },
  {
    marketId: 'closer-tracao-whatsapp',
    label: 'Closer em Tração via WhatsApp Vendas',
    role: 'closer',
    stage: 'tracao',
    businessType: 'servico',
    flagshipJourney: 'whatsapp_vendas',
    rationale:
      'WhatsApp é o canal de maior engajamento comercial no Brasil. Closer sofre com follow-up manual e perda de contexto entre conversas.',
    payablePainSize: 0.85,
    n4plusProofSpeed: 0.9,
    adoptionFriction: 0.7,
    spontaneousReferral: 0.65,
    indispensability: 0.75,
    compositeScore: computeCompositeScore(0.85, 0.9, 0.7, 0.65, 0.75),
    rank: 2,
  },
  {
    marketId: 'afiliado-tracao-afiliacao',
    label: 'Afiliado em Tração via Afiliação',
    role: 'afiliado',
    stage: 'tracao',
    businessType: 'infoproduto',
    flagshipJourney: 'afiliacao',
    rationale:
      'Afiliado precisa rastrear links, otimizar comissão e testar criativos. Mas depende de produtores ativos no ecossistema.',
    payablePainSize: 0.75,
    n4plusProofSpeed: 0.6,
    adoptionFriction: 0.75,
    spontaneousReferral: 0.7,
    indispensability: 0.65,
    compositeScore: computeCompositeScore(0.75, 0.6, 0.75, 0.7, 0.65),
    rank: 3,
  },
  {
    marketId: 'gestor-crescimento-checkout',
    label: 'Gestor em Crescimento via Checkout Direto',
    role: 'gestor',
    stage: 'crescimento',
    businessType: 'ecommerce',
    flagshipJourney: 'checkout_direto',
    rationale:
      'Maior ticket por workspace. Mas exige múltiplos módulos maduros (checkout + CRM + time + dashboard) simultaneamente.',
    payablePainSize: 0.7,
    n4plusProofSpeed: 0.55,
    adoptionFriction: 0.6,
    spontaneousReferral: 0.55,
    indispensability: 0.65,
    compositeScore: computeCompositeScore(0.7, 0.55, 0.6, 0.55, 0.65),
    rank: 4,
  },
  {
    marketId: 'creator-validacao-assinatura',
    label: 'Creator em Validação via Assinatura',
    role: 'creator',
    stage: 'validacao',
    businessType: 'educacao',
    flagshipJourney: 'assinatura',
    rationale:
      'Mercado grande, mas member area e billing recorrente ainda não maduros. Prova N4+ depende de construção longa.',
    payablePainSize: 0.65,
    n4plusProofSpeed: 0.4,
    adoptionFriction: 0.5,
    spontaneousReferral: 0.6,
    indispensability: 0.5,
    compositeScore: computeCompositeScore(0.65, 0.4, 0.5, 0.6, 0.5),
    rank: 5,
  },
] as const;
// =========================================================================
// ACTIVE MARKET — the single recommended entry market
// =========================================================================
const FIRST_CANDIDATE = ENTRY_MARKET_CANDIDATES[0];
if (!FIRST_CANDIDATE) {
  throw new Error('Invariant: ENTRY_MARKET_CANDIDATES is non-empty');
}
export const ACTIVE_ENTRY_MARKET: EntryMarket =
  entryMarketFromCandidate(FIRST_CANDIDATE);
export function findCandidateById(
  id: string,
): EntryMarketCandidate | undefined {
  return ENTRY_MARKET_CANDIDATES.find((c) => c.marketId === id);
}
export function entryMarketFromCandidate(
  candidate: EntryMarketCandidate,
): EntryMarket {
  return {
    marketId: candidate.marketId,
    label: candidate.label,
    role: candidate.role,
    stage: candidate.stage,
    businessType: candidate.businessType,
    flagshipJourney: candidate.flagshipJourney,
    rationale: candidate.rationale,
  };
}
// =========================================================================
// SERVICE
// =========================================================================
const PROVENANCE_SYNTHETIC = {
  source: 'synthetic' as const,
  processor: 'MercadoEntradaDeclarator',
  processorVersion: '0.1.0',
  schemaVersion: '0.1.0',
};
const PROVENANCE_PRODUCTION = {
  source: 'production' as const,
  processor: 'MercadoEntradaDeclarator',
  processorVersion: '0.1.0',
  schemaVersion: '0.1.0',
};
@Injectable()
export class MercadoEntradaDeclaratorService implements OnModuleInit {
  private readonly logger = new Logger(MercadoEntradaDeclaratorService.name);
  private readonly history: EntryMarketDeclaration[] = [];
  private activeDeclaration: EntryMarketDeclaration | undefined;
  public constructor() {}
  public onModuleInit(): void {
    const now = new Date().toISOString();
    const eventId = this.makeEventId();
    this.activeDeclaration = {
      active: ACTIVE_ENTRY_MARKET,
      declaredAt: now,
      declaredBy: 'MercadoEntradaDeclarator.onModuleInit',
      eventId,
    };
    this.history.push(this.activeDeclaration);
    this.logger.log(
      `Active entry market initialised: ${ACTIVE_ENTRY_MARKET.marketId} (event ${eventId})`,
    );
    if (this.spine) {
      void this.spine
        .emit({
          eventName: 'commerce.onboarding.declared',
          truthMode: 'observed',
          provenance: PROVENANCE_SYNTHETIC,
          payload: { ...this.activeDeclaration.active },
        })
        .catch((err: unknown) => {
          this.logger.warn(
            `Failed to emit commerce.onboarding.declared on init: ${(err as Error).message}`,
          );
        });
    }
  }
  // Spine is injected optionally so the service works in pure contexts (tests).
  private spine: SpineEmitterService | undefined;
  public setSpine(spine: SpineEmitterService | undefined): void {
    this.spine = spine ?? undefined;
  }
  // -------------------------------------------------------------------
  // PUBLIC API
  // -------------------------------------------------------------------
  public getActiveMarket(): EntryMarket {
    return this.activeDeclaration?.active ?? ACTIVE_ENTRY_MARKET;
  }
  public getActiveDeclaration(): EntryMarketDeclaration {
    if (!this.activeDeclaration) {
      const eventId = this.makeEventId();
      this.activeDeclaration = {
        active: ACTIVE_ENTRY_MARKET,
        declaredAt: new Date().toISOString(),
        declaredBy: 'getActiveDeclaration-fallback',
        eventId,
      };
      this.history.push(this.activeDeclaration);
    }
    return this.activeDeclaration;
  }
  public getCandidates(): readonly EntryMarketCandidate[] {
    return ENTRY_MARKET_CANDIDATES;
  }
  public getDeclarationHistory(): readonly EntryMarketDeclaration[] {
    return this.history.slice();
  }
  public declareMarket(marketId: string, declaredBy: string): DeclareResult {
    const candidate = findCandidateById(marketId);
    if (!candidate) {
      const result: DeclareResult = {
        ok: false,
        declaration: this.getActiveDeclaration(),
        error: `Unknown marketId: "${marketId}". Use getCandidates() for valid IDs.`,
      };
      return result;
    }
    const previousMarketId = this.activeDeclaration?.active.marketId;
    if (previousMarketId === marketId) {
      return {
        ok: true,
        declaration: {
          active: this.activeDeclaration!.active,
          declaredAt: this.activeDeclaration!.declaredAt,
          declaredBy: this.activeDeclaration!.declaredBy,
          eventId: this.activeDeclaration!.eventId,
        },
      };
    }
    const now = new Date().toISOString();
    const eventId = this.makeEventId();
    const market = entryMarketFromCandidate(candidate);
    const declaration: EntryMarketDeclaration =
      previousMarketId !== undefined
        ? {
            active: market,
            declaredAt: now,
            declaredBy,
            previousMarketId,
            eventId,
          }
        : {
            active: market,
            declaredAt: now,
            declaredBy,
            eventId,
          };
    this.activeDeclaration = declaration;
    this.history.push(declaration);
    this.logger.log(
      `Entry market declared: ${marketId} → previous: ${previousMarketId ?? 'none'} (event ${eventId})`,
    );
    if (this.spine) {
      void this.spine
        .emit({
          eventName: 'commerce.onboarding.declared',
          truthMode: 'observed',
          provenance: PROVENANCE_PRODUCTION,
          payload: {
            marketId: declaration.active.marketId,
            label: declaration.active.label,
            role: declaration.active.role,
            stage: declaration.active.stage,
            businessType: declaration.active.businessType,
            flagshipJourney: declaration.active.flagshipJourney,
            previousMarketId: declaration.previousMarketId ?? null,
            declaredBy: declaration.declaredBy,
            declaredAt: declaration.declaredAt,
          },
        })
        .catch((err: unknown) => {
          this.logger.warn(
            `Failed to emit commerce.onboarding.declared: ${(err as Error).message}`,
          );
        });
    }
    return { ok: true, declaration };
  }
  public buildRanking(): EntryMarketRanking {
    return {
      candidates: ENTRY_MARKET_CANDIDATES,
      active: this.getActiveMarket(),
      rankedAt: new Date().toISOString(),
    };
  }
  // -------------------------------------------------------------------
  // HELPERS
  // -------------------------------------------------------------------
  private makeEventId(): string {
    return `me_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}
