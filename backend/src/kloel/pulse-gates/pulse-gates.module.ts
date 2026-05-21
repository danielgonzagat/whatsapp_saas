import { Module } from '@nestjs/common';
import { LineageModule } from '../lineage/lineage.module';
import { SpineModule } from '../spine/spine.module';
import { LineageGuardService } from '../lineage/lineage-guard.service';
import { PulseSpineBridge } from './pulse-spine.bridge';
import { makeDisclosureEngineGate } from './disclosure-engine.gate';
import { makeEcosystemPrivacyGuard } from './ecosystem-privacy-guard.gate';
import { makeEvidenceProvenanceGate } from './evidence-provenance.gate';
import { makeIdentityProjectionGate } from './identity-projection.gate';
import { makeInternalKnowledgeLeakGuardGate } from './internal-knowledge-leak-guard.gate';
import { makeLineageIntegrityGate } from './lineage-integrity.gate';
import { makeNoOverclaimGate } from './no-overclaim.gate';
import { makeNoRoleplayGate } from './no-roleplay.gate';
import { makeOriginImmutabilityGate } from './origin-immutability.gate';
import { makePlatformBiasMonitorGate } from './platform-bias-monitor.gate';
import { makePromptLeakageGate } from './prompt-leakage.gate';
import { makeTruthModeHonestyGate } from './truth-mode-honesty.gate';
import type { Gate } from './pulse-gates.types';

function staticGate(name: 'protected-files-firewall' | 'codacy-rigor-enforcer'): Gate<unknown> {
  return {
    name,
    mode: 'hard_fail',
    check: () => ({
      gateName: name,
      mode: 'hard_fail',
      status: 'PASS',
      reason: `${name} is enforced at hook level, not runtime`,
      measuredAt: new Date().toISOString(),
      measuredBy: 'pulse-gates.module:static-shim',
    }),
  };
}

@Module({
  imports: [SpineModule, LineageModule],
  providers: [
    PulseSpineBridge,
    {
      provide: 'GATE:disclosure-engine',
      useFactory: () => makeDisclosureEngineGate(),
    },
    {
      provide: 'GATE:ecosystem-privacy-guard',
      useFactory: () => makeEcosystemPrivacyGuard(),
    },
    {
      provide: 'GATE:internal-knowledge-leak-guard',
      useFactory: () => makeInternalKnowledgeLeakGuardGate(),
    },
    {
      provide: 'GATE:platform-bias-monitor',
      useFactory: () => makePlatformBiasMonitorGate(),
    },
    {
      provide: 'GATE:no-roleplay',
      useFactory: () => makeNoRoleplayGate(),
    },
    {
      provide: 'GATE:no-overclaim',
      useFactory: () => makeNoOverclaimGate(),
    },
    {
      provide: 'GATE:prompt-leakage',
      useFactory: () => makePromptLeakageGate(),
    },
    {
      provide: 'GATE:identity-projection',
      useFactory: () => makeIdentityProjectionGate(),
    },
    {
      provide: 'GATE:evidence-provenance',
      useFactory: () => makeEvidenceProvenanceGate(),
    },
    {
      provide: 'GATE:truth-mode-honesty',
      useFactory: () => makeTruthModeHonestyGate(),
    },
    {
      provide: 'GATE:lineage-integrity',
      useFactory: (guard: LineageGuardService) => makeLineageIntegrityGate(guard),
      inject: [LineageGuardService],
    },
    {
      provide: 'GATE:origin-immutability',
      useFactory: (guard: LineageGuardService) => makeOriginImmutabilityGate(guard),
      inject: [LineageGuardService],
    },
    {
      provide: 'GATE:protected-files-firewall',
      useFactory: () => staticGate('protected-files-firewall'),
    },
    {
      provide: 'GATE:codacy-rigor-enforcer',
      useFactory: () => staticGate('codacy-rigor-enforcer'),
    },
  ],
  exports: [PulseSpineBridge],
})
export class PulseGatesModule {}
