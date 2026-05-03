// PULSE — Live Codebase Nervous System
// AST-resolved call graph builder using ts-morph Compiler API.
// Replaces regex-based call resolution with type-aware symbol traces.
//
// Thin re-export shell. Implementation lives in __parts__/ast-graph/.

export { buildAstCallGraph } from './__parts__/ast-graph/graph-builder';
export {
  resolveSymbolAt,
  buildAstGraph,
  resolveSymbol,
  getCallChain,
  findCallers,
} from './__parts__/ast-graph/queries';
export { generateAstGraph } from './__parts__/ast-graph/generate';
