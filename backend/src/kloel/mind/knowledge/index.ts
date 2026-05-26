/**
 * Mind/Knowledge — knowledge layer of the unified Kloel Mind.
 *
 * Barrel of the canonical knowledge services. Importers should prefer the
 * canonical names (`MindKnowledgeAssist`, `MindKnowledgeBase`,
 * `MindVectorStore`, `MindMediaFactory`, `MindHiddenDataExtractor`) over the
 * legacy `AgentAssistService` / `KnowledgeBaseService` / `VectorService` /
 * `MediaFactoryService` / `HiddenDataExtractorService` names.
 *
 * @cluster Mind/Knowledge
 * @see docs/adr/0013-kloel-mind-unification.md
 */
export { MindKnowledgeAssist } from './mind-knowledge-assist.service';
export { MindKnowledgeBase } from './mind-knowledge-base.service';
export { MindVectorStore } from './mind-vector-store.service';
export { MindMediaFactory } from './mind-media-factory.service';
export { MindHiddenDataExtractor } from './mind-hidden-data-extractor.service';
