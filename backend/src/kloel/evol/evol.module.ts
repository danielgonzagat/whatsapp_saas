/**
 * Evol module — Camada XXXII: Self-Evolution under absolute human governance.
 *
 * UTPs: EVOL-001..010.
 *
 * Every improvement must pass through: gap detection → proposal →
 * human authorization → agent dispatch → experiment → rollback guard.
 * Protected files and Codacy MAX-RIGOR are enforced as hard blocks.
 */
import { Module } from '@nestjs/common';
import { GapDetector } from './gap.detector';
import { ProposalBuilder } from './proposal.builder';
import { HumanAuthorizationGateway } from './human-authorization.gateway';
import { AgentOrchestrationBridgeService } from './agent-orchestration.bridge';
import { ExperimentRunner } from './experiment.runner';
import { RTierDeltaMonitor } from './r-tier-delta.monitor';
import { AutomaticRollbackService } from './automatic-rollback.service';
import { ProtectedFilesFirewallService } from './protected-files.firewall';
import { CodacyRigorEnforcer } from './codacy-rigor.enforcer';
import { EvolutionAuditLog } from './evolution-audit.log';

@Module({
  providers: [
    GapDetector,
    ProposalBuilder,
    HumanAuthorizationGateway,
    AgentOrchestrationBridgeService,
    ExperimentRunner,
    RTierDeltaMonitor,
    AutomaticRollbackService,
    ProtectedFilesFirewallService,
    CodacyRigorEnforcer,
    EvolutionAuditLog,
  ],
  exports: [
    GapDetector,
    ProposalBuilder,
    HumanAuthorizationGateway,
    AgentOrchestrationBridgeService,
    ExperimentRunner,
    RTierDeltaMonitor,
    AutomaticRollbackService,
    ProtectedFilesFirewallService,
    CodacyRigorEnforcer,
    EvolutionAuditLog,
  ],
})
export class EvolModule {}
