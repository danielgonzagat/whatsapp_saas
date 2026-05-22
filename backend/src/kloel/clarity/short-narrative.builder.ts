/**
 * UTP-CLARITY-006 — Short Narrative Builder.
 *
 * Builds a brief "what matters now" message from the top-ranked
 * attention items. When anxiety mode is active, the narrative
 * collapses to AGORA-only items with an urgency prefix.
 *
 * Pure function — stateless narrative generation.
 */

import type {
  AttentionRanking,
  AnxietyMode,
  NarrativeInput,
  ShortNarrative,
} from './clarity.types';

const NARRATIVE_MAX_ITEMS = 3;
const NARRATIVE_SEPARATOR = ' | ';

function buildNarrativeId(workspaceId: string, nowMs: number): string {
  return `nar_${workspaceId}_${nowMs}`;
}

function buildMessage(
  topItems: readonly AttentionRanking[],
  anxietyActive: boolean,
): string {
  if (topItems.length === 0) {
    return anxietyActive
      ? '[ANSIEDADE] Nenhum item AGORA detectado.'
      : 'Nada urgente agora.';
  }

  const prefix = anxietyActive ? '[ANSIEDADE] AGORA: ' : '';
  const labels = topItems.map((item) => item.label).join(NARRATIVE_SEPARATOR);

  return `${prefix}${labels}`;
}

function selectTopItems(
  rankings: readonly AttentionRanking[],
  anxietyMode: AnxietyMode,
): readonly AttentionRanking[] {
  const pool = anxietyMode.active
    ? rankings.filter((r) => r.tier === 'AGORA')
    : rankings;

  return pool.slice(0, NARRATIVE_MAX_ITEMS);
}

export function buildShortNarrative(input: NarrativeInput): ShortNarrative {
  const topItems = selectTopItems(input.rankings, input.anxietyMode);
  const message = buildMessage(topItems, input.anxietyMode.active);

  return {
    narrativeId: buildNarrativeId(input.workspaceId, input.nowMs),
    workspaceId: input.workspaceId,
    topItems,
    message,
    generatedAt: new Date(input.nowMs).toISOString(),
    anxietyActive: input.anxietyMode.active,
  };
}
