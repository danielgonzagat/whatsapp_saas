/**
 * @deprecated Legacy ai-brain path. The canonical implementation now lives at
 * `backend/src/kloel/mind/knowledge/hidden-data.service.ts` and is exported as
 * `MindHiddenDataExtractor` via the `kloel/mind/knowledge` barrel
 * (ADR-0013 Wave M5 physical-move, 2026-05-27).
 *
 * This stub re-exports the implementation during the alias window so existing
 * importers continue to compile. Prefer:
 *
 * ```ts
 * import { MindHiddenDataExtractor } from '../kloel/mind/knowledge';
 * ```
 *
 * @cluster Mind/Knowledge
 * @canonical backend/src/kloel/mind/knowledge/hidden-data.service.ts
 * @see docs/adr/0013-kloel-mind-unification.md
 */
export { HiddenDataExtractorService } from '../kloel/mind/knowledge/hidden-data.service';
