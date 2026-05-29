/**
 * Canonical event-name aliases — `kloel.*` → `cognition.*` migration helper.
 *
 * Per `docs/architecture/EVENT_TAXONOMY.md` §2.9 + Brain→Mind unification, all
 * `kloel.*` event names are being migrated to the canonical `cognition.*`
 * namespace. This file implements the non-destructive dual-emit pattern:
 * legacy names continue to fire so downstream readers (SQL aggregators,
 * decision catalogs, partial-outcome whitelists) do not break, while the new
 * canonical name fires alongside so consumers can migrate at their own pace.
 *
 * The grace window is 4 weeks (per ADR-0013 §4). After that, the legacy emit
 * sites are removed and only the canonical name remains.
 *
 * Workspace isolation: this helper does not perform any I/O. It only computes
 * canonical strings and invokes the caller-provided emit callback twice. The
 * caller is responsible for passing workspaceId into each payload, preserving
 * the existing isolation boundary.
 */

/**
 * Authoritative map of legacy `kloel.*` event names to their canonical
 * `cognition.*` equivalent. Adding a new entry here registers a new alias
 * pair; removing one is a breaking change for the grace window.
 *
 * Keep this list synchronized with
 * `docs/architecture/EVENT_TAXONOMY_MIGRATION.md` (table-row per entry).
 *
 * @deprecated The keys (legacy names) are scheduled for removal once the
 *   4-week grace window closes and the nightly drift query returns zero hits
 *   for 7 consecutive days.
 */
export const KLOEL_TO_COGNITION_ALIAS = {
  'kloel.handoff.confidence': 'cognition.handoff.confidence',
  'kloel.handoff.confidence.blocking': 'cognition.handoff.confidence.blocking',
  'kloel.chat.turn': 'cognition.chat.turn',
} as const;

export type KloelLegacyEventName = keyof typeof KLOEL_TO_COGNITION_ALIAS;
export type CognitionCanonicalEventName =
  (typeof KLOEL_TO_COGNITION_ALIAS)[KloelLegacyEventName];

/**
 * Resolve the canonical `cognition.*` equivalent for a legacy `kloel.*` name.
 * Returns `undefined` when the input is not a registered legacy name — that
 * lets call sites no-op the alias emission when given an arbitrary string,
 * without throwing.
 */
export function resolveCanonicalAlias(
  legacy: string,
): CognitionCanonicalEventName | undefined {
  if (legacy in KLOEL_TO_COGNITION_ALIAS) {
    return KLOEL_TO_COGNITION_ALIAS[legacy as KloelLegacyEventName];
  }
  return undefined;
}

/**
 * Compute the dual-emit pair `{ legacy, canonical }` for a legacy
 * `kloel.*` event. Throws when the input is unknown so the alias table stays
 * the single source of truth (vs. silent drift from typos at call sites).
 */
export function dualEventNames(
  legacy: KloelLegacyEventName,
): { legacy: KloelLegacyEventName; canonical: CognitionCanonicalEventName } {
  const canonical = KLOEL_TO_COGNITION_ALIAS[legacy];
  return { legacy, canonical };
}

/**
 * Higher-order helper: invokes `emit(name, payload)` twice — once with the
 * legacy `kloel.*` name and once with the canonical `cognition.*` name. The
 * payload object is shallow-cloned so each emission carries an independent
 * `context` field (when present) reflecting its own event name.
 *
 * Used to migrate emit sites without changing their existing call-shape too
 * invasively: replace `emit('kloel.chat.turn', payload)` with
 * `emitCognitionAlias(emit, 'kloel.chat.turn', payload)`.
 *
 * @param emit caller-provided emission function (sync or async). Errors are
 *   not swallowed — the caller decides whether to wrap in try/catch.
 * @param legacy registered legacy event name (must be in the alias map).
 * @param payload event payload; if it has a `context` field, that field will
 *   be rewritten per emission so the structured-log channel matches the name.
 */
export function emitCognitionAlias<T extends Record<string, unknown>>(
  emit: (eventName: string, payload: T) => void,
  legacy: KloelLegacyEventName,
  payload: T,
): void {
  const canonical = KLOEL_TO_COGNITION_ALIAS[legacy];

  // Emit legacy first so any synchronous reader that already observed the
  // legacy name keeps observing it before the canonical event fires.
  const legacyPayload = rewriteContext(payload, legacy);
  emit(legacy, legacyPayload);

  const canonicalPayload = rewriteContext(payload, canonical);
  emit(canonical, canonicalPayload);
}

/**
 * Shallow-clone helper that overrides the `context` key (when present) with
 * the supplied event name. Used by {@link emitCognitionAlias} so structured
 * logs carry the same name in both the bus-level event name and the payload
 * context field (a common DataDog/Grafana convention).
 */
function rewriteContext<T extends Record<string, unknown>>(
  payload: T,
  contextName: string,
): T {
  if (!('context' in payload)) {
    return payload;
  }
  return { ...payload, context: contextName };
}
