/**
 * Feature flag for routing direct `prisma.mindCase.create(...)` writers through
 * the canonical {@link MindCaseMemoryService.recordCase} ingest path.
 *
 * Two production writers create `RAC_MindCase` rows with raw
 * `prisma.mindCase.create(...)` and therefore BYPASS the token-extraction
 * invariant that `recordCase` guarantees (`tokens: tokenize(text)` — the
 * substrate the similarity/dedup retrieval in `MindCaseMemoryService.similar`
 * depends on):
 *   - {@link MindMultiModalPerceptionService.captureToCaseMemory} (writes
 *     `tokens: []` — perception captures are NEVER retrievable by token);
 *   - {@link MindCanonicalService.recordCase} (passes caller-supplied `tokens`
 *     through verbatim — the canonical facade trusts the caller).
 *
 * When this flag is `'true'` AND a `MindCaseMemoryService` instance is
 * available at the call site, those two writers DELEGATE to
 * `recordCase(...)`, which derives `tokens` from `text` so the rows join the
 * retrievable corpus. When the flag is OFF (default) OR no `MindCaseMemoryService`
 * is injected, each writer keeps its EXACT current direct `prisma.mindCase.create`
 * — BYTE-IDENTICAL to today.
 *
 * DEFAULT OFF. No schema change. No backfill. Reversible by env alone.
 *
 * @see backend/src/kloel/mind/memory/mind-case-memory.service.ts (recordCase)
 * @see backend/src/kloel/mind/perception/mind-multimodal-perception.service.ts
 * @see backend/src/kloel/mind/mind-canonical.service.ts
 */
export function isMindCaseViaRecordCaseEnabled(): boolean {
  return process.env.KLOEL_MINDCASE_VIA_RECORDCASE === 'true';
}
