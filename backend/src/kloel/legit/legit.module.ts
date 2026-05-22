import { Module } from '@nestjs/common';

/**
 * LegitModule — Camada LEGIT (UTP-LEGIT-001..013).
 *
 * Delegar sem medo de risco legal/regulatorio/reputacional.
 * Cobre LGPD/GDPR/CCPA privacy compliance, consent ledger,
 * WhatsApp policy, Email (CAN-SPAM/LGPD), Ads (CONAR/ANVISA),
 * Affiliate Terms (FTC/CONAR), Commercial Promise Guard,
 * Regulated Content Detection, Image Rights Checker,
 * Policy Update Watcher, Risk Flag Elevator,
 * Block with Justification, and Legal Consult Trigger.
 *
 * All core logic is pure functions exported from their respective
 * files. This module serves as the wiring point for NestJS DI
 * when stateful services are added in future waves.
 */
@Module({
  providers: [],
  exports: [],
})
export class LegitModule {}
