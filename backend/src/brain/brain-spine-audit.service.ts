/**
 * @deprecated Re-export shim for ADR-0013 Wave M3.
 *
 * The canonical implementation now lives at
 * `backend/src/kloel/mind/observability/mind-spine-audit.service.ts`
 * and is exported as `MindSpineAudit`. New imports must use the
 * canonical path or the barrel at
 * `backend/src/kloel/mind/observability/index.ts`.
 *
 * This file exists only during the 4-week alias window. It will be
 * removed once `scripts/ops/check-mind-canonical-imports.mjs --strict`
 * reports 0 callers of the legacy `BrainSpineAuditService` symbol.
 *
 * @cluster Mind/Observability
 * @canonical backend/src/kloel/mind/observability/mind-spine-audit.service.ts
 * @see docs/adr/0013-kloel-mind-unification.md
 */
export {
  MindSpineAudit,
  /** @deprecated Use {@link MindSpineAudit} instead. */
  MindSpineAudit as BrainSpineAuditService,
  type SpineAuditResult,
} from '../kloel/mind/observability/mind-spine-audit.service';
