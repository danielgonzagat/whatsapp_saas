import type { FraudBlacklistType } from '@prisma/client';

/** Threshold configuration for mapping cumulative score to action. */
export interface FraudThresholdConfig {
  /** Score at/above which the engine returns `block`. */
  BLOCK: number;
  /** Score at/above which the engine returns `review`. */
  REVIEW: number;
  /** Score at/above which the engine returns `require_3ds`. */
  REQUIRE_3DS: number;
}

/** Soft-signal score bumps applied during evaluation. */
export interface FraudScoreConfig {
  /** Bump when no buyer identifier is supplied. */
  missingIdentifier: number;
  /** Bump when the order amount exceeds the 3DS-required ceiling. */
  highAmount: number;
  /** Bump when card country or IP country differs from order country. */
  foreignBin: number;
}

/** Velocity-window limits keyed by signal kind. */
export interface FraudVelocityConfig {
  /** Length of the rolling velocity window in seconds. */
  windowSeconds: number;
  /** Per-IP attempt ceiling inside the window. */
  maxAttemptsPerIp: number;
  /** Per-device-fingerprint attempt ceiling inside the window. */
  maxAttemptsPerDevice: number;
  /** Per-email attempt ceiling inside the window. */
  maxAttemptsPerEmail: number;
  /** Per-document (CPF/CNPJ) attempt ceiling inside the window. */
  maxAttemptsPerDocument: number;
}

/** Fully resolved fraud-engine config used at runtime. */
export interface FraudEngineConfig {
  /** Score-to-action thresholds. */
  thresholds: FraudThresholdConfig;
  /** Soft-signal score bumps. */
  scores: FraudScoreConfig;
  /** Amount in cents that triggers a forced 3DS step. */
  highAmount3dsCents: bigint;
  /** Velocity-window limits. */
  velocity: FraudVelocityConfig;
}

/** Default threshold mapping used when env overrides are absent. */
export const DEFAULT_FRAUD_THRESHOLDS: Readonly<FraudThresholdConfig> = {
  BLOCK: 0.8,
  REVIEW: 0.5,
  REQUIRE_3DS: 0.3,
};

/** Default soft-signal score bumps. */
export const DEFAULT_FRAUD_SCORES: Readonly<FraudScoreConfig> = {
  missingIdentifier: 0.4,
  highAmount: 0.3,
  foreignBin: 0.35,
};

/** Default velocity-window limits. */
export const DEFAULT_FRAUD_VELOCITY: Readonly<FraudVelocityConfig> = {
  windowSeconds: 10 * 60,
  maxAttemptsPerIp: 5,
  maxAttemptsPerDevice: 5,
  maxAttemptsPerEmail: 4,
  maxAttemptsPerDocument: 3,
};

/** Default hard ceiling above which 3DS is forced regardless of score. */
export const DEFAULT_HIGH_AMOUNT_3DS_CENTS: bigint = 100_000n; // R$ 1.000,00

/** Clamp a raw score into the [0, 1] range, rounded to 3 decimals. */
export function clampScore(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(3))));
}

/**
 * Read a numeric env var, falling back to `fallback` when the var is missing,
 * not finite, or below `minimum`.
 */
export function readNumberEnv(name: string, fallback: number, minimum = 0): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < minimum) {
    return fallback;
  }
  return parsed;
}

/**
 * Read an integer env var, truncating the value and re-checking the minimum.
 * Returns `fallback` when the truncated value would drop below `minimum`.
 */
export function readIntegerEnv(name: string, fallback: number, minimum = 1): number {
  const parsed = Math.trunc(readNumberEnv(name, fallback, minimum));
  return parsed >= minimum ? parsed : fallback;
}

/**
 * Read a bigint env var, returning `fallback` on missing, malformed, or
 * negative values.
 */
export function readBigIntEnv(name: string, fallback: bigint): bigint {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  try {
    const parsed = BigInt(raw);
    return parsed >= 0n ? parsed : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Resolve the runtime fraud-engine config from env vars, layering env overrides
 * over the embedded defaults. `highAmount3dsCentsFallback` lets the caller
 * supply a custom ceiling (defaults to `DEFAULT_HIGH_AMOUNT_3DS_CENTS`).
 */
export function buildFraudConfig(
  highAmount3dsCentsFallback: bigint = DEFAULT_HIGH_AMOUNT_3DS_CENTS,
): FraudEngineConfig {
  return {
    thresholds: {
      BLOCK: readNumberEnv('FRAUD_BLOCK_THRESHOLD', DEFAULT_FRAUD_THRESHOLDS.BLOCK),
      REVIEW: readNumberEnv('FRAUD_REVIEW_THRESHOLD', DEFAULT_FRAUD_THRESHOLDS.REVIEW),
      REQUIRE_3DS: readNumberEnv(
        'FRAUD_REQUIRE_3DS_THRESHOLD',
        DEFAULT_FRAUD_THRESHOLDS.REQUIRE_3DS,
      ),
    },
    scores: {
      missingIdentifier: readNumberEnv(
        'FRAUD_MISSING_IDENTIFIER_SCORE',
        DEFAULT_FRAUD_SCORES.missingIdentifier,
      ),
      highAmount: readNumberEnv('FRAUD_HIGH_AMOUNT_SCORE', DEFAULT_FRAUD_SCORES.highAmount),
      foreignBin: readNumberEnv('FRAUD_FOREIGN_BIN_SCORE', DEFAULT_FRAUD_SCORES.foreignBin),
    },
    highAmount3dsCents: readBigIntEnv('FRAUD_HIGH_AMOUNT_3DS_CENTS', highAmount3dsCentsFallback),
    velocity: {
      windowSeconds:
        readIntegerEnv('FRAUD_VELOCITY_WINDOW_MINUTES', DEFAULT_FRAUD_VELOCITY.windowSeconds / 60) *
        60,
      maxAttemptsPerIp: readIntegerEnv(
        'FRAUD_VELOCITY_MAX_ATTEMPTS_PER_IP',
        DEFAULT_FRAUD_VELOCITY.maxAttemptsPerIp,
      ),
      maxAttemptsPerDevice: readIntegerEnv(
        'FRAUD_VELOCITY_MAX_ATTEMPTS_PER_DEVICE',
        DEFAULT_FRAUD_VELOCITY.maxAttemptsPerDevice,
      ),
      maxAttemptsPerEmail: readIntegerEnv(
        'FRAUD_VELOCITY_MAX_ATTEMPTS_PER_EMAIL',
        DEFAULT_FRAUD_VELOCITY.maxAttemptsPerEmail,
      ),
      maxAttemptsPerDocument: readIntegerEnv(
        'FRAUD_VELOCITY_MAX_ATTEMPTS_PER_DOCUMENT',
        DEFAULT_FRAUD_VELOCITY.maxAttemptsPerDocument,
      ),
    },
  };
}

/**
 * Normalize a blacklist value into the canonical form expected by Postgres.
 * - CPF / CNPJ / CARD_BIN: trim and strip non-digits.
 * - EMAIL: trim and lowercase.
 * - Everything else: trim only.
 */
export function normalizeFraudValue(type: FraudBlacklistType, value: string): string {
  const trimmed = value.trim();
  switch (type) {
    case 'CPF':
    case 'CNPJ':
    case 'CARD_BIN':
      return trimmed.replace(/\D/g, '');
    case 'EMAIL':
      return trimmed.toLowerCase();
    default:
      return trimmed;
  }
}
