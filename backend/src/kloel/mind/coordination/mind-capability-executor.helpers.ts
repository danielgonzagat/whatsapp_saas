/**
 * Barrel re-export for the mind-capability-executor helpers module. The
 * implementation lives in themed sibling files (`.runtime.ts`, `.cognitive.ts`,
 * `.prisma.ts`) so each stays under the 400-LOC gate. Importers must keep
 * using this path — the public API (function names and signatures) is
 * unchanged.
 */
export {
  buildRailwayDeploymentsQuery,
  buildSelfRuntimeSnapshot,
  buildVercelDeploymentsUrl,
  getRailwayRuntimeConfig,
  getVercelRuntimeConfig,
  parseRailwayDeploymentResponse,
  parseVercelDeploymentResponse,
  runtimeErrorMessage,
  type RailwayRuntimeConfig,
  type SelfRuntimeSnapshot,
  type VercelRuntimeConfig,
} from './mind-capability-executor.helpers.runtime';

export {
  buildInspectSelfWorkQueue,
  computeCognitiveGaps,
  normalizeIdentityAudience,
  readOptionalNum,
  readOptionalStr,
  selectSilentSurfaces,
  type DissolutionGapLike,
  type IdentityAudienceLike,
} from './mind-capability-executor.helpers.cognitive';

export {
  buildContactSearchOr,
  buildConversationStatusFilter,
  buildProductSearchClause,
  buildRevenueWindow,
  computeRevenueSummary,
  type RevenueSummary,
  type RevenueSummaryInput,
} from './mind-capability-executor.helpers.prisma';
