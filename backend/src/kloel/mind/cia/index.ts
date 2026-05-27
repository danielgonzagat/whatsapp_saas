/**
 * Mind/CIA — learning adapter layer of the unified Kloel Mind.
 *
 * Per ADR-0006 (papeis cognitivos canonicos), the legacy CIA (Commercial
 * Intelligence Adapter) is kept as a **learning adapter** — it does NOT
 * make commercial decisions; it can only feed priors, baselines, and
 * candidates into the Mind. ADR-0013 Wave M4 moves the canonical home of
 * CIA into `kloel/mind/cia/`. The legacy files in `backend/src/cia/`
 * remain as @deprecated re-exports during the 4-week alias window, then
 * the implementation moves here.
 *
 * Canonical renames in this barrel:
 *   - CiaService → MindLearningAdapter (the entry point per ADR-0006)
 *
 * All other Cia* classes keep their names — they are scoped pieces of the
 * learning adapter, not top-level concepts.
 *
 * @cluster Mind/CIA
 * @see docs/adr/0006-papeis-cognitivos-canonicos.md
 * @see docs/adr/0013-kloel-mind-unification.md
 */
export {
  CiaService as MindLearningAdapter,
  /** @deprecated Use {@link MindLearningAdapter} instead. */
  CiaService,
} from './cia.service';

export { CiaAutonomyAdvisorService } from './cia-autonomy-advisor.service';
export { CiaBacklogRunService } from './cia-backlog-run.service';
export { CiaBootstrapService } from './cia-bootstrap.service';
export { CiaChatFilterService } from './cia-chat-filter.service';
export { CiaCognitiveHealthService } from './cia-cognitive-health.service';
export { CiaInlineFallbackService } from './cia-inline-fallback.service';
export { CiaRemoteBacklogService } from './cia-remote-backlog.service';
export { CiaRuntimeStateService } from './cia-runtime-state.service';
export { CiaRuntimeService } from '../../../cia/cia-runtime.service';
export { CiaSendHelpersService } from './cia-send-helpers.service';

export { CiaController } from './cia.controller';
export { CiaModule } from '../../../cia/cia.module';

// Wave M4 progress — physically moved here (no longer re-exported from legacy):
export {
  CIA_RUNTIME_SERVICE,
  type CiaBacklogMode,
  type CiaBacklogOptions,
  type CiaRuntimePort,
} from './cia-runtime.port';

export { CiaRuntimeService as WhatsappCiaRuntimeService } from './cia-runtime.abstract';
