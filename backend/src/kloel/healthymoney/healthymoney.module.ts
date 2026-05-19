import { Module } from '@nestjs/common';
import { RevenueQualityScorerService } from './revenue-quality.scorer.service';

/**
 * HealthyMoney module — Camada XIX: Healthy Money Optimization.
 *
 * B0.7: Otimizar dinheiro saudável, não volume bruto.
 * Receita boa cresce e receita ruim cai simultaneamente.
 *
 * UTPs: HEALTHYMONEY-001..008.
 *
 * Capacidades: scorer de qualidade de receita; projetores de margem,
 * refund risk, custo de suporte; detector de desgaste de marca;
 * bloqueador de venda ruim com política revisitável pelo dono;
 * dashboard receita boa vs ruim.
 *
 * All services are pure logic — no external dependencies.
 * Uses canonical PCI.1 event taxonomy domain `commerce.payment.*`.
 */
@Module({
  imports: [],
  providers: [RevenueQualityScorerService],
  exports: [RevenueQualityScorerService],
})
export class HealthyMoneyModule {}
