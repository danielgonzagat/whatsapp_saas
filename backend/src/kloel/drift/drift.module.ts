import { Module } from '@nestjs/common';

/**
 * DriftModule — Camada X (UTP-DRIFT-001..006).
 *
 * Behavioral Drift Observability: weekly behavior snapshots per workspace
 * with drift detection, attribution, commercial-language explanation,
 * narrative composition, and evidence collection.
 *
 * All core functions are pure — no DI needed. The module exists to
 * satisfy NestJS DI conventions and expose the services when injected.
 */
@Module({
  exports: [],
})
export class DriftModule {}
