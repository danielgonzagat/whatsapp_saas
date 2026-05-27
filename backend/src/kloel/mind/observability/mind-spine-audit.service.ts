/**
 * MindSpineAudit — canonical name for the cognitive spine audit service
 * (ADR-0013 Wave M3).
 *
 * Legacy implementation: `backend/src/brain/brain-spine-audit.service.ts`.
 *
 * @cluster Mind/Observability
 * @see docs/adr/0013-kloel-mind-unification.md
 */
export {
  BrainSpineAuditService as MindSpineAudit,
  /** @deprecated Use {@link MindSpineAudit} instead. */
  BrainSpineAuditService,
  type SpineAuditResult,
} from '../../../brain/brain-spine-audit.service';
