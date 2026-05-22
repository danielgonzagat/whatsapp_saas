import { Module } from '@nestjs/common';
import { SpineModule } from '../spine/spine.module';
import { ConcentrationDetector } from './concentration.detector';
import { HealthMonitor } from './health.monitor';
import { BanRiskDetector } from './ban-risk.detector';
import { PolicyChangeWatcher } from './policy-change.watcher';
import { ContingencyPlanBuilder } from './contingency-plan.builder';
import { OwnedAudiencePusher } from './owned-audience.pusher';
import { MigrationOrchestrator } from './migration.orchestrator';
import { DiversificationRecommender } from './diversification.recommender';

/**
 * ChannelModule — Camada XXVIII (UTP-CHANNEL-001..008).
 *
 * Channel survival intelligence: concentration detection, health monitoring,
 * ban-risk assessment, policy-change watching, contingency planning,
 * owned-audience pushing, migration orchestration, and diversification
 * recommendations.
 *
 * Implements B0.7 (channel independence — don't die when a channel falls),
 * PCI.1 canonical event domains, and PCI.5 conventions.
 */
@Module({
  imports: [SpineModule],
  providers: [
    ConcentrationDetector,
    HealthMonitor,
    BanRiskDetector,
    PolicyChangeWatcher,
    ContingencyPlanBuilder,
    OwnedAudiencePusher,
    MigrationOrchestrator,
    DiversificationRecommender,
  ],
  exports: [
    ConcentrationDetector,
    HealthMonitor,
    BanRiskDetector,
    PolicyChangeWatcher,
    ContingencyPlanBuilder,
    OwnedAudiencePusher,
    MigrationOrchestrator,
    DiversificationRecommender,
  ],
})
export class ChannelModule {}
