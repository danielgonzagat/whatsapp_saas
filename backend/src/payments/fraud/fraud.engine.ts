import { InjectRedis } from '@nestjs-modules/ioredis';
import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../../logging/structured-logger';
import * as Sentry from '@sentry/node';
import type { FraudBlacklist, FraudBlacklistType } from '@prisma/client';
import type Redis from 'ioredis';

import { PrismaService } from '../../prisma/prisma.service';

import type {
  AddBlacklistInput,
  FraudCheckoutContext,
  FraudDecision,
  FraudReason,
} from './fraud.types';
import {
  buildFraudConfig,
  clampScore,
  DEFAULT_FRAUD_THRESHOLDS,
  DEFAULT_HIGH_AMOUNT_3DS_CENTS,
  type FraudThresholdConfig,
  normalizeFraudValue,
} from './fraud.engine.helpers';

/**
 * Centralized antifraude engine. Evaluated BEFORE every PaymentIntent so
 * blocked transactions never reach Stripe. Sources of evidence:
 *
 *   1. Marketplace blacklist (FraudBlacklist) — exact-match against any of
 *      the typed signals (CPF/CNPJ/email/IP/device fingerprint/card BIN).
 *      A blacklist hit is an automatic BLOCK with score 1.0.
 *   2. Soft signals — high-amount thresholds, missing identifiers — bump
 *      the score and may downgrade ALLOW into REVIEW or REQUIRE_3DS.
 *
 * The engine uses:
 *
 *   - blacklist global via Postgres,
 *   - velocity windows via Redis,
 *   - high amount + missing identifier soft scoring,
 *   - foreign card-country/BIN signal for BR checkouts,
 *   - configurable thresholds/scores via env.
 */
@Injectable()
export class FraudEngine {
  private readonly logger = StructuredLogger.from(FraudEngine.name);
  private readonly config = buildFraudConfig(DEFAULT_HIGH_AMOUNT_3DS_CENTS);

  /**
   * Score thresholds used to map the cumulative score to an action.
   * Tunable but immutable at runtime — changes require a code review.
   */
  static readonly THRESHOLDS: Readonly<FraudThresholdConfig> = DEFAULT_FRAUD_THRESHOLDS;

  /** Hard ceiling above which we always require 3DS regardless of score. */
  static readonly HIGH_AMOUNT_3DS_CENTS = DEFAULT_HIGH_AMOUNT_3DS_CENTS;

  constructor(
    private readonly prisma: PrismaService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  /** Evaluate. */
  async evaluate(ctx: FraudCheckoutContext): Promise<FraudDecision> {
    const reasons: FraudReason[] = [];
    let score = 0;

    const blacklistHits = await this.findBlacklistHits(ctx);
    if (blacklistHits.length > 0) {
      const detail = blacklistHits.map((h) => `${h.type}=${h.reason}`).join(', ');
      this.logger.warn(`Blacklist hit for workspace=${ctx.workspaceId}: ${detail}`);
      const decision: FraudDecision = {
        action: 'review',
        score: this.config.thresholds.REVIEW,
        reasons: blacklistHits.map<FraudReason>((h) => ({
          signal: 'blacklist',
          detail: `${h.type} matched: ${h.reason}`,
        })),
      };
      this.logDecision(ctx, decision);
      return decision;
    }

    try {
      const velocityReasons = await this.evaluateVelocity(ctx);
      if (velocityReasons.length > 0) {
        const decision: FraudDecision = {
          action: 'review' as const,
          score: this.config.thresholds.REVIEW,
          reasons: velocityReasons,
        };
        this.logDecision(ctx, decision);
        return decision;
      }
    } catch (error: unknown) {
      this.logger.error(
        `Velocity antifraud check failed for workspace=${ctx.workspaceId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      Sentry.captureException(error, {
        tags: { type: 'financial_alert', operation: 'fraud_velocity' },
        extra: { workspaceId: ctx.workspaceId, amountCents: ctx.amountCents.toString() },
        level: 'fatal',
      });
      reasons.push({
        signal: 'velocity_unavailable',
        detail: 'velocity counters unavailable; checkout routed to review fail-closed path',
      });
      score = Math.max(score, this.config.thresholds.REVIEW);
    }

    if (!ctx.buyerEmail && !ctx.buyerCpf && !ctx.buyerCnpj) {
      reasons.push({
        signal: 'missing_identifier',
        detail: 'no email, cpf, or cnpj provided on checkout',
      });
      score = clampScore(score + this.config.scores.missingIdentifier);
    }

    const orderCountry = String(ctx.orderCountry || 'BR')
      .trim()
      .toUpperCase();
    const cardCountry = String(ctx.cardCountry || '')
      .trim()
      .toUpperCase();
    if (orderCountry === 'BR' && cardCountry && cardCountry !== 'BR') {
      reasons.push({
        signal: 'foreign_bin',
        detail: `card country ${cardCountry} differs from checkout country ${orderCountry}`,
      });
      score = clampScore(score + this.config.scores.foreignBin);
    }

    const ipCountry = String(ctx.ipCountry || '')
      .trim()
      .toUpperCase();
    if (orderCountry === 'BR' && ipCountry && ipCountry !== 'BR') {
      reasons.push({
        signal: 'ip_mismatch',
        detail: `IP country ${ipCountry} differs from checkout country ${orderCountry}`,
      });
      score = clampScore(score + this.config.scores.foreignBin);
    }

    if (ctx.amountCents > this.config.highAmount3dsCents) {
      reasons.push({
        signal: 'high_amount',
        detail: `amount ${ctx.amountCents.toString()} exceeds 3DS-required ceiling ${this.config.highAmount3dsCents.toString()}`,
      });
      score = clampScore(
        score + Math.max(this.config.scores.highAmount, this.config.thresholds.REQUIRE_3DS),
      );
    }

    const decision = {
      action: this.scoreToAction(score),
      score: clampScore(score),
      reasons,
    };
    this.logDecision(ctx, decision);
    return decision;
  }

  /**
   * Add or upsert a blacklist row. Idempotent on `(type, value)` via the
   * unique constraint — calling twice with the same pair updates the
   * `reason` and `addedBy`.
   */
  async addToBlacklist(input: AddBlacklistInput): Promise<FraudBlacklist> {
    const normalizedValue = normalizeFraudValue(input.type, input.value);
    return this.prisma.fraudBlacklist.upsert({
      where: { type_value: { type: input.type, value: normalizedValue } },
      create: {
        type: input.type,
        value: normalizedValue,
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

  /** List blacklist rows. */
  async listBlacklist(input?: {
    type?: FraudBlacklistType;
    value?: string;
    skip?: number;
    take?: number;
  }): Promise<{ items: FraudBlacklist[]; total: number }> {
    const where = {
      ...(input?.type ? { type: input.type } : {}),
      ...(input?.value
        ? {
            value: {
              contains: normalizeFraudValue(input.type ?? 'EMAIL', input.value),
              mode: 'insensitive' as const,
            },
          }
        : {}),
    };
    const skip = Math.max(0, input?.skip ?? 0);
    const take = Math.min(200, Math.max(1, input?.take ?? 50));
    const [items, total] = await this.prisma.$transaction(
      [
        this.prisma.fraudBlacklist.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { type: 'asc' }, { value: 'asc' }],
          skip,
          take,
        }),
        this.prisma.fraudBlacklist.count({ where }),
      ],
      { isolationLevel: 'ReadCommitted' },
    );

    return { items, total };
  }

  /** Remove a blacklist row. */
  async removeFromBlacklist(input: {
    type: FraudBlacklistType;
    value: string;
  }): Promise<{ removedCount: number }> {
    const result = await this.prisma.fraudBlacklist.deleteMany({
      where: {
        type: input.type,
        value: normalizeFraudValue(input.type, input.value),
      },
    });

    return { removedCount: result.count };
  }

  private async findBlacklistHits(ctx: FraudCheckoutContext): Promise<FraudBlacklist[]> {
    const candidates: Array<{ type: FraudBlacklistType; value: string }> = [];
    if (ctx.buyerCpf) {
      candidates.push({ type: 'CPF', value: normalizeFraudValue('CPF', ctx.buyerCpf) });
    }
    if (ctx.buyerCnpj) {
      candidates.push({ type: 'CNPJ', value: normalizeFraudValue('CNPJ', ctx.buyerCnpj) });
    }
    if (ctx.buyerEmail) {
      candidates.push({ type: 'EMAIL', value: normalizeFraudValue('EMAIL', ctx.buyerEmail) });
    }
    if (ctx.buyerIp) {
      candidates.push({ type: 'IP', value: normalizeFraudValue('IP', ctx.buyerIp) });
    }
    if (ctx.deviceFingerprint) {
      candidates.push({
        type: 'DEVICE_FINGERPRINT',
        value: normalizeFraudValue('DEVICE_FINGERPRINT', ctx.deviceFingerprint),
      });
    }
    if (ctx.cardBin) {
      candidates.push({
        type: 'CARD_BIN',
        value: normalizeFraudValue('CARD_BIN', ctx.cardBin),
      });
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

  private async evaluateVelocity(ctx: FraudCheckoutContext): Promise<FraudReason[]> {
    const candidates: Array<{
      signal: string;
      label: string;
      value: string | null;
      limit: number;
    }> = [
      {
        signal: 'velocity_ip',
        label: 'ip',
        value: ctx.buyerIp ? normalizeFraudValue('IP', ctx.buyerIp) : null,
        limit: this.config.velocity.maxAttemptsPerIp,
      },
      {
        signal: 'velocity_device',
        label: 'device',
        value: ctx.deviceFingerprint
          ? normalizeFraudValue('DEVICE_FINGERPRINT', ctx.deviceFingerprint)
          : null,
        limit: this.config.velocity.maxAttemptsPerDevice,
      },
      {
        signal: 'velocity_email',
        label: 'email',
        value: ctx.buyerEmail ? normalizeFraudValue('EMAIL', ctx.buyerEmail) : null,
        limit: this.config.velocity.maxAttemptsPerEmail,
      },
      {
        signal: 'velocity_document',
        label: 'document',
        value: ctx.buyerCpf
          ? normalizeFraudValue('CPF', ctx.buyerCpf)
          : ctx.buyerCnpj
            ? normalizeFraudValue('CNPJ', ctx.buyerCnpj)
            : null,
        limit: this.config.velocity.maxAttemptsPerDocument,
      },
    ];

    const reasons: FraudReason[] = [];
    for (const candidate of candidates) {
      if (!candidate.value) {
        continue;
      }
      const currentAttempts = await this.incrementVelocityCounter(
        candidate.signal,
        candidate.value,
      );
      if (currentAttempts > candidate.limit) {
        reasons.push({
          signal: 'velocity',
          detail: `${candidate.label} exceeded ${candidate.limit} attempts in ${Math.trunc(
            this.config.velocity.windowSeconds / 60,
          )}m`,
        });
      }
    }

    return reasons;
  }

  private async incrementVelocityCounter(kind: string, value: string): Promise<number> {
    const key = `fraud:velocity:v1:${kind}:${value}`;
    const current = await this.redis.incr(key);
    if (current === 1) {
      await this.redis.expire(key, this.config.velocity.windowSeconds);
    }
    return current;
  }

  private logDecision(ctx: FraudCheckoutContext, decision: FraudDecision): void {
    const payload = JSON.stringify({
      event: 'fraud_decision',
      workspaceId: ctx.workspaceId,
      action: decision.action,
      score: decision.score,
      amountCents: ctx.amountCents.toString(),
      signals: decision.reasons.map((reason) => reason.signal),
      reasons: decision.reasons,
      buyerIp: ctx.buyerIp ?? null,
      deviceFingerprint: ctx.deviceFingerprint ?? null,
      buyerEmail: ctx.buyerEmail ? normalizeFraudValue('EMAIL', ctx.buyerEmail) : null,
      buyerCpf: ctx.buyerCpf ? normalizeFraudValue('CPF', ctx.buyerCpf) : null,
      buyerCnpj: ctx.buyerCnpj ? normalizeFraudValue('CNPJ', ctx.buyerCnpj) : null,
      cardBin: ctx.cardBin ? normalizeFraudValue('CARD_BIN', ctx.cardBin) : null,
      cardCountry: ctx.cardCountry ?? null,
      orderCountry: ctx.orderCountry ?? 'BR',
    });

    if (decision.action === 'allow') {
      this.logger.log(payload);
      return;
    }
    this.logger.warn(payload);
  }

  private scoreToAction(score: number): FraudDecision['action'] {
    if (score >= this.config.thresholds.REVIEW) {
      return 'review';
    }
    if (score >= this.config.thresholds.REQUIRE_3DS) {
      return 'require_3ds';
    }
    return 'allow';
  }
}
