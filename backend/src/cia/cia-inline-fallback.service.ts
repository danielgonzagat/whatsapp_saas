/**
 * @deprecated Use `backend/src/kloel/mind/cia/cia-inline-fallback.service` directly.
 *   Per ADR-0013 Wave M4 (DEPRECATION_MAP — CIA learning adapter
 *   canonicalization). Sunset 2026-06-24.
 *
 * This file remains as a thin re-export shim during the 4-week alias window
 * so external callers keep building while the rest of the cia/ folder is
 * incrementally migrated to `kloel/mind/cia/`.
 *
 * @canonical backend/src/kloel/mind/cia/cia-inline-fallback.service.ts
 * @see docs/adr/0013-kloel-mind-unification.md
 */
export { CiaInlineFallbackService } from '../kloel/mind/cia/cia-inline-fallback.service';
