export {
  classifyOpportunityCandidate,
  buildCompressedOpportunityContext,
  mapOpportunityBucket,
} from './opportunity-classify';
export { maybeScoreContactWithAi } from './opportunity-ai-scorer';
export { buildHeuristicCatalogScore, inferHeuristicDemographics } from './opportunity-heuristic';
export {
  acquireCiaContactLock,
  releaseCiaContactLock,
  upsertCatalogConversationShell,
} from './opportunity-lock';
