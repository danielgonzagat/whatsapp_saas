import { Injectable, Logger } from '@nestjs/common';
import type { FraudBlacklist, FraudBlacklistType } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

import type {
  AddBlacklistInput,
  FraudCheckoutContext,
  FraudDecision,
  FraudReason,
} from './fraud.types';

/**
 * Centralized antifraude engine. Evaluated BEFORE every PaymentIntent so
 * blocked transactions never reach Stripe. Sources of evidence:
 *
 *   1. Platform blacklist (FraudBlacklist) — exact-match against any of
 *      the typed signals (CPF/CNPJ/email/IP/device fingerprint/card BIN).
 *      A blacklist hit is an automatic BLOCK with score 1.0.
 *   2. Soft signals — high-amount thresholds, missing identifiers — bump
 *      the score and may downgrade ALLOW into REVIEW or REQUIRE_3DS.
 *
 * The engine is intentionally minimal at MVP: blacklist + amount + missing
 * identifier. Velocity (N transactions per IP/CPF in window), device
 * reputation, and ML-based scoring are roadmap items that plug into the
 * same `FraudDecision` shape.
 */
@Injectable()
export class FraudEngine {
  private readonly logger = new Logger(FraudEngine.name);

  /**
   * Score thresholds used to map the cumulative score to an action.
   * Tunable but immutable at runtime — changes require a code review.
   */
  static readonly THRESHOLDS = {
    BLOCK: 0.8,
    REVIEW: 0.5,
    REQUIRE_3DS: 0.3,
  } as const;

  /** Hard ceiling above which we always require 3DS regardless of score. */
  static readonly HIGH_AMOUNT_3DS_CENTS = 100_000n; // R$ 1.000,00

  constructor(private readonly prisma: PrismaService) {}

  /** Evaluate. */
  async evaluate(ctx: FraudCheckoutContext): Promise<FraudDecision> {
    const reasons: FraudReason[] = [];
    let score = 0;

    const blacklistHits = await this.findBlacklistHits(ctx);
    if (blacklistHits.length > 0) {
      const detail = blacklistHits.map((h) => `${h.type}=${h.reason}`).join(', ');
      this.logger.warn(`Blacklist hit for workspace=${ctx.workspaceId}: ${detail}`);
      return {
        action: 'block',
        score: 1.0,
        reasons: blacklistHits.map<FraudReason>((h) => ({
          signal: 'blacklist',
          detail: `${h.type} matched: ${h.reason}`,
        })),
      };
    }

    if (!ctx.buyerEmail && !ctx.buyerCpf && !ctx.buyerCnpj) {
      reasons.push({
        signal: 'missing_identifier',
        detail: 'no email, cpf, or cnpj provided on checkout',
      });
      score += 0.4;
    }

    if (ctx.amountCents > FraudEngine.HIGH_AMOUNT_3DS_CENTS) {
      reasons.push({
        signal: 'high_amount',
        detail: `amount ${ctx.amountCents.toString()} exceeds 3DS-required ceiling ${FraudEngine.HIGH_AMOUNT_3DS_CENTS.toString()}`,
      });
      score = Math.max(score, FraudEngine.THRESHOLDS.REQUIRE_3DS);
    }

    return {
      action: this.scoreToAction(score),
      score,
      reasons,
    };
  }

  /**
   * Add or upsert a blacklist row. Idempotent on `(type, value)` via the
   * unique constraint — calling twice with the same pair updates the
   * `reason` and `addedBy`.
   */
  async addToBlacklist(input: AddBlacklistInput): Promise<FraudBlacklist> {
    return this.prisma.fraudBlacklist.upsert({
      where: { type_value: { type: input.type, value: input.value } },
      create: {
        type: input.type,
        value: input.value,
        reason: input.reason,
        addedBy: input.addedBy ?? null,
        expiresAt: input.expiresAt ?? null,
      },
      update: {
        reason: input.reason,
        addedBy: input.addedBy ?? null,
        expiresAt: input.expiresAt ?? null,
      },
    });
  }

  private async findBlacklistHits(ctx: FraudCheckoutContext): Promise<FraudBlacklist[]> {
    const candidates: Array<{ type: FraudBlacklistType; value: string }> = [];
    if (ctx.buyerCpf) {
      candidates.push({ type: 'CPF', value: ctx.buyerCpf });
    }
    if (ctx.buyerCnpj) {
      candidates.push({ type: 'CNPJ', value: ctx.buyerCnpj });
    }
    if (ctx.buyerEmail) {
      candidates.push({ type: 'EMAIL', value: ctx.buyerEmail.toLowerCase() });
    }
    if (ctx.buyerIp) {
      candidates.push({ type: 'IP', value: ctx.buyerIp });
    }
    if (ctx.deviceFingerprint) {
      candidates.push({ type: 'DEVICE_FINGERPRINT', value: ctx.deviceFingerprint });
    }
    if (ctx.cardBin) {
      candidates.push({ type: 'CARD_BIN', value: ctx.cardBin });
    }

    if (candidates.length === 0) {
      return [];
    }

    const now = new Date();
    const rows = await this.prisma.fraudBlacklist.findMany({
      where: {
        OR: candidates.map(({ type, value }) => ({ type, value })),
      },
    });

    return rows.filter((r) => !r.expiresAt || r.expiresAt > now);
  }

  private scoreToAction(score: number): FraudDecision['action'] {
    if (score >= FraudEngine.THRESHOLDS.BLOCK) {
      return 'block';
    }
    if (score >= FraudEngine.THRESHOLDS.REVIEW) {
      return 'review';
    }
    if (score >= FraudEngine.THRESHOLDS.REQUIRE_3DS) {
      return 'require_3ds';
    }
    return 'allow';
  }
}
