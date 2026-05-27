/**
 * MindMediaFactory — canonical name for the media-generation service
 * (ADR-0013 Wave M2; physically relocated to this directory in Wave M5,
 * 2026-05-27).
 *
 * Implementation: `./media-factory.service.ts` (co-located).
 * Legacy alias: `backend/src/ai-brain/media-factory.service.ts` re-exports
 * from this canonical home during the deprecation window.
 *
 * @cluster Mind/Knowledge
 * @see docs/adr/0013-kloel-mind-unification.md
 */
export {
  MediaFactoryService as MindMediaFactory,
  /** @deprecated Use {@link MindMediaFactory} instead. */
  MediaFactoryService,
} from './media-factory.service';
