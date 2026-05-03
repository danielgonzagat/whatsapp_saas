/**
 * PULSE Property-Based, Fuzz, and Mutation Testing Evidence Collector
 *
 * Collects evidence from three testing strategies without executing external tools.
 * Scans the codebase for existing property-based tests (fast-check), generates
 * fuzz test case metadata for discovered API endpoints, and identifies mutation
 * testing targets based on coverage gaps.
 *
 * Artifact stored at: .pulse/current/PULSE_PROPERTY_EVIDENCE.json
 */

export {
  buildPropertyTestEvidence,
  writePropertyEvidenceFile,
} from './__parts__/property-tester/evidence-builder';
export {
  discoverEndpoints,
  classifyEndpointRisk,
} from './__parts__/property-tester/endpoint-discovery';
export { generateFuzzCasesFromEndpoints } from './__parts__/property-tester/fuzz-generation';
export { computeMutationTargets } from './__parts__/property-tester/mutation-targets';
export {
  scanForExistingPropertyTests,
  generatePropertyTestTargets,
} from './__parts__/property-tester/property-scan';
export { discoverPureFunctionCandidates } from './__parts__/property-tester/pure-function-candidates';
export { generatePropertyTestCases } from './__parts__/property-tester/test-case-generation';
