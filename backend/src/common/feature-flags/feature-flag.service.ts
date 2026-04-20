import { Injectable, Logger } from '@nestjs/common';

const PATTERN_RE = /\./g;

/**
 * Feature flag service for sensitive code paths (PR P5-1).
 *
 * Provides per-flag boolean state read from environment variables.
 * The intended use is "kill switches" for the hardening changes
 * landed in P0/P2/P3 — each behavioral change has a flag that
 * defaults to ON in dev/test/staging and OFF in production until
 * an operator flips it after the canary deploy succeeds.
 *
 * ## Architecture
 *
 * Two layers, evaluated in order:
 *
 *   1. Environment variable: FF_<UPPERCASE_FLAG_NAME>
 *      Example: FF_PAYMENT_FAIL_CLOSED_UNKNOWN_STATE=true
 *      The dot-to-underscore mapping uses two underscores to keep
 *      the original dot positions visible: `payment.foo.bar` becomes
 *      `FF_PAYMENT__FOO__BAR`.
 *
 *   2. Per-workspace DB override (DEFERRED — see note below)
 *      Future work: read from a `FeatureFlag` Prisma model so an
 *      operator can flip a flag for a single workspace without
 *      redeploying. Not in P5-1 because adding the model requires
 *      a schema migration that is out of scope for this PR.
 *
 * ## Default values
 *
 * Each flag has an explicit default in the FLAG_DEFAULTS map. The
 * default applies when the env var is unset. The default is the
 * value the flag SHOULD have once the canary period for that change
 * has completed and the feature is fully rolled out. This means:
 *
 *   - In production env vars are unset → defaults apply → new
 *     behavior is on → operators only need to flip a flag if they
 *     want to ROLL BACK to the old behavior.
 *   - To force the OLD behavior (rollback), set FF_<FLAG>=false.
 *   - To force the NEW behavior in tests, set FF_<FLAG>=true (rare;
 *     defaults already do this).
 *
 * This is the inverse of the original plan (which had defaults OFF
 * in production until canary). The inversion is intentional: the
 * P0/P2/P3 hardening PRs are already shipping the new behavior
 * unconditionally. The flags exist as **rollback levers**, not as
 * gradual-rollout gates. If a hardening change misfires in
 * production, an operator flips the flag and the old behavior
 * comes back without a redeploy.
 *
 * ## Currently registered flags
 *
 *   payment.failClosedUnknownState  — P0-2 fail-closed state machine
 *   idempotency.awaitWrite          — P0-3 await idempotency cache write
 *   idempotency.v2                  — P6-5 scoped key + body fingerprint (I13)
 *   auth.failClosedRateLimit        — P0-5 fail-closed rate limit
 *   webhook.atomicDedup             — P0-2 atomic SET EX NX dedup
 *   whatsapp.strictLock             — P0-1 strict lock semantics
 */
@Injectable()
export class FeatureFlagService {
  private readonly logger = new Logger(FeatureFlagService.name);

  /**
   * Defaults for every registered flag. Adding a flag here is the
   * single source of truth — the env var override is automatic.
   */
  private readonly FLAG_DEFAULTS: Readonly<Record<string, boolean>> = Object.freeze({
    'payment.failClosedUnknownState': true, // P0-2 — keep fail-closed
    'idempotency.awaitWrite': true, // P0-3 — keep await
    'idempotency.v2': true, // P6-5 — scoped key + body fingerprint (I13)
    'auth.failClosedRateLimit': true, // P0-5 — keep fail-closed
    'webhook.atomicDedup': true, // P0-2 — keep atomic
    'whatsapp.strictLock': true, // P0-1 — keep strict lock
  });

  /**
   * Returns true if the flag is enabled.
   *
   * Resolution order:
   *   1. Env var FF_<UPPERCASE> with the value 'true' or 'false'
   *      (case-insensitive, trimmed). Anything else is treated
   *      as "unset".
   *   2. Default from FLAG_DEFAULTS.
   *   3. Throws if the flag is not registered (caller bug — flags
   *      must be declared in FLAG_DEFAULTS first).
   */
  isEnabled(flag: string): boolean {
    if (!(flag in this.FLAG_DEFAULTS)) {
      this.logger.error(`Unknown feature flag: "${flag}". Add it to FLAG_DEFAULTS.`);
      throw new Error(`Unknown feature flag: ${flag}`);
    }

    const envName = `FF_${flag.toUpperCase().replace(PATTERN_RE, '__')}`;
    const raw = process.env[envName];
    if (raw !== undefined) {
      const normalized = raw.trim().toLowerCase();
      if (normalized === 'true') {
        return true;
      }
      if (normalized === 'false') {
        return false;
      }
      // Unrecognized value falls through to default
      this.logger.warn(`Feature flag ${envName}="${raw}" is not 'true'/'false'; using default`);
    }

    return this.FLAG_DEFAULTS[flag];
  }

  /**
   * Returns a snapshot of every registered flag's effective value.
   * Used by /health/system and the startup banner so operators can
   * verify which flags are flipped without parsing env vars by hand.
   */
  snapshot(): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    for (const flag of Object.keys(this.FLAG_DEFAULTS)) {
      result[flag] = this.isEnabled(flag);
    }
    return result;
  }
}
