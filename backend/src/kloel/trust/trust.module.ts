/**
 * UTP-TRUST-001 — Trust Module
 *
 * Camada IX: Trust Capital Protection. Exposes TrustStateTrackerService
 * and its companion pure-function detectors for consumption by the
 * cognitive organism (autopilot, reply engine, commercial orchestrator).
 */

import { Module } from '@nestjs/common';
import { TrustStateTrackerService } from './trust-state-tracker.service';

@Module({
  providers: [TrustStateTrackerService],
  exports: [TrustStateTrackerService],
})
export class TrustModule {}
