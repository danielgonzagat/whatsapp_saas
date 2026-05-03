/**
 * PULSE Contract Testing & Schema Diff Engine
 *
 * Validates external provider API contracts against expected schemas, detects
 * breaking changes in the internal API surface by comparing against a previous
 * structural snapshot, and assesses Prisma migration safety for destructive
 * database operations.
 *
 * Artifact stored at: .pulse/current/PULSE_CONTRACT_EVIDENCE.json
 */

export { buildContractTestEvidence } from './__parts__/contract-tester/runner';
export {
  buildExpectedContracts,
  mergeContracts,
  scanProviderSdkUsage,
  generateContractTestCases,
} from './__parts__/contract-tester/contract-building';
export { defineProviderContracts } from './__parts__/contract-tester/provider-discovery';
export { providerFromUrl } from './__parts__/contract-tester/helpers';
export { checkAPISchemaDiff, isInternalEndpoint } from './__parts__/contract-tester/schema-diff';
export {
  checkMigrationSafety,
  classifyBreakingChange,
} from './__parts__/contract-tester/migration-safety';
