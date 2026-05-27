/**
 * MindKnowledgeAssist — canonical name for the cognitive-knowledge assist
 * service (ADR-0013 Wave M2).
 *
 * This file is the canonical entry point. The legacy implementation lives at
 * `backend/src/ai-brain/agent-assist.service.ts` and is marked `@deprecated`
 * during the 4-week alias window. After M7 the implementation moves here and
 * `ai-brain/` is removed.
 *
 * @cluster Mind/Knowledge
 * @see docs/adr/0013-kloel-mind-unification.md
 */
export {
  AgentAssistService as MindKnowledgeAssist,
  /** @deprecated Use {@link MindKnowledgeAssist} instead. */
  AgentAssistService,
} from '../../../ai-brain/agent-assist.service';
