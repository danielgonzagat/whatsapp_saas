import { Module } from '@nestjs/common';
import { SpineModule } from '../spine/spine.module';
import { PulseSpineBridge } from './pulse-spine.bridge';
import { makeDisclosureEngineGate } from './disclosure-engine.gate';
import { makeEcosystemPrivacyGuard } from './ecosystem-privacy-guard.gate';
import { makeInternalKnowledgeLeakGuardGate } from './internal-knowledge-leak-guard.gate';
import { makePlatformBiasMonitorGate } from './platform-bias-monitor.gate';

@Module({
  imports: [SpineModule],
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
  ],
  exports: [PulseSpineBridge],
})
export class PulseGatesModule {}
