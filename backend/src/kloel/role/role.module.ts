import { Module } from '@nestjs/common';
import { LeverageMapService } from './leverage-map.service';
import { MultiHatService } from './multi-hat.service';

/**
 * RoleModule — Camada XXIII (UTP-ROLE-001..008).
 *
 * Role-Aware Commercial Intelligence: detects the workspace owner's
 * economic role (produtor, afiliado, agencia, gestor, closer,
 * creator, especialista) from spine usage patterns, maps real
 * levers per role, guards recommendations by control radius,
 * supports multi-role workspaces, and extends the Clarity hierarchy
 * and Wisdom context with role awareness.
 *
 * Exports: LeverageMapService, MultiHatService.
 * Pure functions (detector, projector, guard, extenders) are
 * importable directly without DI.
 */
@Module({
  providers: [LeverageMapService, MultiHatService],
  exports: [LeverageMapService, MultiHatService],
})
export class RoleModule {}
