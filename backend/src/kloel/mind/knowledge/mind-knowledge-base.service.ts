/**
 * MindKnowledgeBase — canonical name for the knowledge-base service
 * (ADR-0013 Wave M2).
 *
 * Legacy implementation: `backend/src/ai-brain/knowledge-base.service.ts`.
 *
 * @cluster Mind/Knowledge
 * @see docs/adr/0013-kloel-mind-unification.md
 */
export {
  KnowledgeBaseService as MindKnowledgeBase,
  /** @deprecated Use {@link MindKnowledgeBase} instead. */
  KnowledgeBaseService,
} from '../../../ai-brain/knowledge-base.service';
