import { Module } from '@nestjs/common';

/**
 * AgencyModule — Camada XXV (UTP-AGENCY-001..008).
 *
 * Operar multiplos clientes sem perder contexto, margem ou prioridade.
 * Zero vazamento de conhecimento entre clientes.
 *
 * All core logic is pure functions exported from their respective
 * files. This module serves as the wiring point for NestJS DI
 * when stateful services are added in future waves.
 *
 * Implements the Agency family: portfolio state, per-client context,
 * priority ranking, margin tracking, churn risk detection, team load
 * balancing, internal knowledge leak guard, and handoff.
 */
@Module({
  providers: [],
  exports: [],
})
export class AgencyModule {}
