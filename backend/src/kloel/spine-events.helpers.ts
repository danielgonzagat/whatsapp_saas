/**
 * Canonical helpers for filtering `SpineEventRef[]` streams.
 *
 * Consolidates 3 identical `filterByWorkspace` implementations previously
 * scattered across kloel/channel, kloel/defens, kloel/postsale-consumers.
 *
 * Add new SpineEvent helpers here — never duplicate the workspace filter.
 */

import type { SpineEventRef } from './mind/mind.types';

/**
 * Return only events for the given workspace.
 *
 * The SpineEvent stream is tenant-shared at the bus level; every consumer
 * MUST filter by `workspaceId` before processing. This canonical helper
 * is the single supported way to do that.
 */
export function filterByWorkspace(
  events: readonly SpineEventRef[],
  workspaceId: string,
): readonly SpineEventRef[] {
  return events.filter((e) => e.workspaceId === workspaceId);
}

/**
 * Return only events for the given workspace AND optional entityRef.
 *
 * If `entityRef` is omitted, behaves as `filterByWorkspace`.
 */
export function filterByWorkspaceAndEntity(
  events: readonly SpineEventRef[],
  workspaceId: string,
  entityRef?: { readonly entityType: string; readonly entityId: string },
): readonly SpineEventRef[] {
  const workspaceEvents = filterByWorkspace(events, workspaceId);
  if (!entityRef) return workspaceEvents;
  return workspaceEvents.filter(
    (event) =>
      event.entityRef?.entityType === entityRef.entityType &&
      event.entityRef.entityId === entityRef.entityId,
  );
}
