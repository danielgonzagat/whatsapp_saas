import { Module } from '@nestjs/common';
import { ErrorNonRepeatGuard } from './error-non-repeat.guard';
import { TrustAfterErrorTracker } from './trust-after-error.tracker';

/**
 * RecoveryModule — Camada XIV (UTP-RECOVERY-001..007).
 *
 * Mature failure recovery: self-detection, honest acknowledgment,
 * commercial explanation, non-repeat guarding, damage recovery
 * tactics, weekly narrative integration, and trust-after-error
 * trajectory tracking.
 *
 * Stateless functions (detectors, builders, tactics, narrative)
 * are exported as pure functions from their respective modules.
 * Stateful services (guard, tracker) are NestJS providers.
 */
@Module({
  providers: [ErrorNonRepeatGuard, TrustAfterErrorTracker],
  exports: [ErrorNonRepeatGuard, TrustAfterErrorTracker],
})
export class RecoveryModule {}
