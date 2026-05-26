/**
 * Mind/Observability — observability layer of the unified Kloel Mind.
 *
 * Barrel of canonical observability services for cognitive spine audit,
 * lift reports, daily reports, and runtime tracing.
 *
 * @cluster Mind/Observability
 * @see docs/adr/0013-kloel-mind-unification.md
 */
export { MindSpineAudit, type SpineAuditResult } from './mind-spine-audit.service';
