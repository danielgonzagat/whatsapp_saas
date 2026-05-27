/**
 * @deprecated Legacy ai-brain path. The canonical implementation now lives at
 * `backend/src/kloel/mind/knowledge/vector.service.ts` and is exported as
 * `MindVectorStore` via the `kloel/mind/knowledge` barrel
 * (ADR-0013 Wave M2 physical-move, 2026-05-27,
 * MIND_SERVICES_CANONICAL row #22). Sunset 2026-06-24.
 *
 * This stub re-exports the implementation during the alias window so existing
 * importers continue to compile. Prefer:
 *
 * ```ts
 * import { MindVectorStore } from '../kloel/mind/knowledge';
 * ```
 *
 * @cluster Mind/Knowledge
 * @canonical backend/src/kloel/mind/knowledge/vector.service.ts
 * @see docs/adr/0013-kloel-mind-unification.md
 */
export { VectorService } from '../kloel/mind/knowledge/vector.service';
