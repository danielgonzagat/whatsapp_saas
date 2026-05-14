/**
 * UTP-TEAM-001..007 — Team Module
 *
 * Camada XII: Team Augmentation. Third stage — Kloel accepted as ally
 * by the human team. Provides pre-call context, next-best-action
 * suggestions, forgotten-followup rescue, blind-spot illumination,
 * smart handoff packaging, respect protocol, and operator feedback loop.
 *
 * Onda 3: second-order consumer of spine events.
 */

import { Module } from '@nestjs/common';
import { SmartHandoffService } from './smart-handoff.service';
import { SpineModule } from '../spine/spine.module';

@Module({
  imports: [SpineModule],
  providers: [SmartHandoffService],
  exports: [SmartHandoffService],
})
export class TeamModule {}
