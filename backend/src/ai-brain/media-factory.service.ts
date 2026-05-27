/**
 * @deprecated Legacy ai-brain path. The canonical implementation now lives at
 * `backend/src/kloel/mind/knowledge/media-factory.service.ts` and is exported
 * as `MindMediaFactory` via the `kloel/mind/knowledge` barrel
 * (ADR-0013 Wave M5 physical-move, 2026-05-27,
 * MIND_SERVICES_CANONICAL row #21).
 *
 * This stub re-exports the implementation during the alias window so existing
 * importers continue to compile. Prefer:
 *
 * ```ts
 * import { MindMediaFactory } from '../kloel/mind/knowledge';
 * ```
 *
 * @cluster Mind/Knowledge
 * @canonical backend/src/kloel/mind/knowledge/media-factory.service.ts
 * @see docs/adr/0013-kloel-mind-unification.md
 */
export { MediaFactoryService } from '../kloel/mind/knowledge/media-factory.service';
