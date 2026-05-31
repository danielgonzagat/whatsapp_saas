/**
 * MindKnowledgeAssist — canonical name for the cognitive-knowledge assist
 * service (ADR-0013 Wave M2 row #22).
 *
 * As of Wave 8, the implementation lives in this directory at
 * `./agent-assist.service`. A `@deprecated` re-export stub at
 * `backend/src/ai-brain/agent-assist.service` keeps the old import path alive
 * during the alias window (sunset 2026-06-24).
 *
 * @cluster Mind/Knowledge
 * @see docs/adr/0013-kloel-mind-unification.md
 */
export {
  AgentAssistService as MindKnowledgeAssist,
  /** @deprecated Use {@link MindKnowledgeAssist} instead. */
  AgentAssistService,
} from './agent-assist.service';
