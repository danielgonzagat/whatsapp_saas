/**
 * MindHiddenDataExtractor — canonical name for the latent-signal extractor
 * (ADR-0013 Wave M2).
 *
 * Legacy implementation: `backend/src/ai-brain/hidden-data.service.ts`.
 *
 * @cluster Mind/Knowledge
 * @see docs/adr/0013-kloel-mind-unification.md
 */
export {
  HiddenDataExtractorService as MindHiddenDataExtractor,
  /** @deprecated Use {@link MindHiddenDataExtractor} instead. */
  HiddenDataExtractorService,
} from '../../../ai-brain/hidden-data.service';
