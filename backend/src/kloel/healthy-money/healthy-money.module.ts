import { Module } from '@nestjs/common';
import { BlockerPolicyService } from './blocker-policy.service';

/**
 * HealthyMoneyModule — Camada XIX (UTP-HEALTHYMONEY-001..008).
 *
 * Receita boa cresce e receita ruim cai simultaneamente.
 * Implements B0.7. All scorers and projectors are pure functions;
 * only the BlockerPolicyService is a NestJS provider for
 * owner-revisable policy state.
 */
@Module({
  providers: [BlockerPolicyService],
  exports: [BlockerPolicyService],
})
export class HealthyMoneyModule {}
