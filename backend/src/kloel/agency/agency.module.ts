import { Module } from '@nestjs/common';
import { PortfolioStateService } from './portfolio-state.service';
import { PerClientContextBundler } from './per-client-context.bundler';

/**
 * AgencyModule — Camada XXV (UTP-AGENCY-009..010).
 *
 * Operar multiplos clientes sem perder contexto, margem ou prioridade.
 * Zero vazamento de conhecimento entre clientes.
 *
 * PortfolioStateService: consolida estado da carteira (clientCount,
 * marginPerClient, churnRiskPerClient, priorityRanking, teamLoad).
 *
 * PerClientContextBundler: constroi contexto por cliente com isolamento
 * estrito (isolationToken criptografico para cada par agency-client).
 */
@Module({
  providers: [PortfolioStateService, PerClientContextBundler],
  exports: [PortfolioStateService, PerClientContextBundler],
})
export class AgencyModule {}
