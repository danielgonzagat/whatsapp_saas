// PULSE — Live Codebase Nervous System
// Universal Code Behavior Graph Builder
// Analyzes the codebase at a per-function level using ts-morph AST traversal
// with a regex fallback for files that fail to parse.

export { buildBehaviorGraph } from './__parts__/behavior-graph/build';
export {
  getCriticalPaths,
  getNodesWithoutObservability,
  generateBehaviorGraph,
} from './__parts__/behavior-graph/exports';
