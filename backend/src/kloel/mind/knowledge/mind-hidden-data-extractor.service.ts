/**
 * MindHiddenDataExtractor — canonical name for the latent-signal extractor
 * (ADR-0013 Wave M2; physically relocated to this directory in Wave M5,
 * 2026-05-27).
 *
 * Implementation: `./hidden-data.service.ts` (co-located).
 * Legacy alias: `backend/src/ai-brain/hidden-data.service.ts` re-exports from
 * this canonical home during the deprecation window.
 *
 * @cluster Mind/Knowledge
 * @see docs/adr/0013-kloel-mind-unification.md
 */
export {
  HiddenDataExtractorService as MindHiddenDataExtractor,
  /** @deprecated Use {@link MindHiddenDataExtractor} instead. */
  HiddenDataExtractorService,
} from './hidden-data.service';
