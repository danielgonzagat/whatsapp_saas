/**
 * @deprecated Use `backend/src/kloel/mind/cia/cia-cognitive-health.service` directly.
 *   Per ADR-0013 Wave M4 (DEPRECATION_MAP row #42 — CIA learning adapter
 *   canonicalization). Sunset 2026-06-24.
 *
 * This file remains as a thin re-export shim during the 4-week alias window
 * so external callers (mind-bg.scheduler.ts and cia.module.ts) keep building
 * while the rest of the cia/ folder is incrementally migrated to
 * `kloel/mind/cia/`.
 *
 * @canonical backend/src/kloel/mind/cia/cia-cognitive-health.service.ts
 * @see docs/adr/0013-kloel-mind-unification.md
 */
export { CiaCognitiveHealthService } from '../kloel/mind/cia/cia-cognitive-health.service';
