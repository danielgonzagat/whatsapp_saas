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
} from '../../../cia/cia.service';

export { CiaAutonomyAdvisorService } from '../../../cia/cia-autonomy-advisor.service';
export { CiaBacklogRunService } from '../../../cia/cia-backlog-run.service';
export { CiaBootstrapService } from '../../../cia/cia-bootstrap.service';
export { CiaChatFilterService } from '../../../cia/cia-chat-filter.service';
export { CiaCognitiveHealthService } from '../../../cia/cia-cognitive-health.service';
export { CiaInlineFallbackService } from '../../../cia/cia-inline-fallback.service';
export { CiaRemoteBacklogService } from '../../../cia/cia-remote-backlog.service';
export { CiaRuntimeStateService } from '../../../cia/cia-runtime-state.service';
export { CiaRuntimeService } from '../../../cia/cia-runtime.service';
export { CiaSendHelpersService } from '../../../cia/cia-send-helpers.service';

export { CiaController } from '../../../cia/cia.controller';
export { CiaModule } from '../../../cia/cia.module';
