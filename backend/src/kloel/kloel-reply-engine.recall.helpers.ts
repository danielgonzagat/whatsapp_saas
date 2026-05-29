import type { StructuredLogger } from '../logging/structured-logger';
import type { LongTermMemoryService } from './mind/memory/long-term-memory.service';

/**
 * Wave5 L6 — Y-8 frontier capability #2 wiring for the reply engine.
 *
 * {@link LongTermMemoryService.recallRelevant} already consolidates durable
 * per-workspace outcome facts (what tends to work / what tends to fail) but no
 * caller queried it before generating a reply — every conversation started
 * from a blank slate. This helper bridges that gap, mirroring the emotional-
 * tone helper already wired into the engine:
 *
 *  - {@link buildRecallDirective} recalls the strongest durable facts for the
 *    workspace and renders a natural-language directive to inject into the
 *    generation prompt's dynamic runtime context.
 *
 * Strictly additive and fail-open: when the LTM service is unavailable, throws,
 * or has no durable facts yet, it returns null and the reply path proceeds
 * exactly as before. (recallRelevant is itself read-only and returns [] on
 * error, so this never mutates state and never blocks generation.)
 */

/** A recalled durable fact as returned by recallRelevant. */
interface RecalledFact {
  readonly fact: string;
  readonly valence: 'positive' | 'negative';
  readonly strength: number;
  readonly occurrences: number;
}

export interface RecallDirective {
  /** Number of facts surfaced into the directive. */
  readonly factCount: number;
  /** Ready-to-inject natural-language directive for the generation prompt. */
  readonly directive: string;
}

/** Default cap on how many durable facts feed the prompt — keep it tight so
 * recall steers without flooding the context window. */
const DEFAULT_RECALL_LIMIT = 5;

/**
 * Renders a single recalled fact into a human-readable bullet. The valence is
 * translated into "tende a converter / dar certo" vs "tende a falhar" so the
 * model reads the durable signal as guidance, not raw event names.
 */
function renderFactLine(fact: RecalledFact): string {
  const tendency =
    fact.valence === 'positive' ? 'tende a dar certo' : 'tende a não dar certo';
  return `- ${fact.fact}: ${tendency} (reforçado ${fact.occurrences}x).`;
}

/**
 * Recalls the strongest durable outcome facts for the workspace and builds a
 * directive to inject into the generation prompt. Fail-open: returns null when
 * the LTM service is missing, the workspace is unknown, recall throws, or there
 * are no durable facts yet.
 */
export async function buildRecallDirective(
  ltm: LongTermMemoryService | undefined,
  params: {
    workspaceId?: string | null;
    limit?: number;
    logger?: Pick<StructuredLogger, 'warn'>;
  },
): Promise<RecallDirective | null> {
  if (!ltm || !params.workspaceId) {
    return null;
  }
  try {
    const facts = await ltm.recallRelevant(params.workspaceId, {
      limit: params.limit ?? DEFAULT_RECALL_LIMIT,
    });
    if (!Array.isArray(facts) || facts.length === 0) {
      return null;
    }
    const directive = [
      'MEMÓRIA DURÁVEL (o que costuma funcionar neste workspace):',
      ...facts.map(renderFactLine),
      'Use esses padrões como contexto — priorize o que tende a dar certo e evite o que tende a não dar certo, sem citá-los textualmente.',
    ].join('\n');
    return { factCount: facts.length, directive };
  } catch (err: unknown) {
    params.logger?.warn('kloel_recall_directive_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
