/**
 * MindVectorStore — canonical name for the vector-store service
 * (ADR-0013 Wave M2).
 *
 * Legacy implementation: `backend/src/ai-brain/vector.service.ts`.
 *
 * @cluster Mind/Knowledge
 * @see docs/adr/0013-kloel-mind-unification.md
 */
export {
  VectorService as MindVectorStore,
  /** @deprecated Use {@link MindVectorStore} instead. */
  VectorService,
} from '../../../ai-brain/vector.service';
