/**
 * PULSE Dynamic Reality Kernel
 *
 * Derives PULSE configuration, thresholds, catalogs, and decision rules from
 * observed runtime evidence and schema-derived truth sources instead of
 * hardcoded constants. Every function in this module produces values that were
 * previously hardcoded as literals, enums, sets, and switch cases across the
 * PULSE codebase.
 *
 * Import this module to replace hardcoded reality with dynamically derived truth.
 */
export { STATUS_CODES } from 'node:http';
export {
  deriveHttpStatusFromObservedCatalog,
  discoverAllObservedHttpStatusCodes,
  observeStatusTextLengthFromCatalog,
  deriveCatalogPercentScaleFromObservedCatalog,
  deriveUnitValue,
  deriveZeroValue,
  discoverRouteSeparatorFromRuntime,
  discoverPropertyPassedStatusFromTypeEvidence,
  discoverPropertyUnexecutedStatusFromExecutionEvidence,
  discoverBoundaryStrategiesFromTypeEvidence,
  discoverMutatingEffectsFromTypeEvidence,
  discoverDestructiveEffectsFromTypeEvidence,
  discoverPublicExposuresFromTypeEvidence,
  discoverProtectedExposuresFromTypeEvidence,
  type DerivedCandidateCategory,
  inferCandidateCategoryFromObservedTokens,
  type DerivedPropertyKind,
  derivePropertyKindsFromObservedCategory,
  splitIdentifierTokensFromObservedName,
  hasObservedToken,
} from './__parts__/dynamic-reality-kernel/catalog-discovery';
export {
  type DerivedFuzzStrategy,
  deriveFuzzStrategyFromObservedPropertyShape,
  deriveExpectedStatusCodesFromObservedProfile,
  deriveEndpointRiskFromObservedProfile,
  inferCoverageFromObservedFileCharacteristics,
  deriveMutantEstimateFromObservedFileEvidence,
  deriveStrategyWeightFromObservedProfile,
  deriveFuzzBudgetFromObservedDimensions,
  deriveNumericProbeValuesFromObservedCatalog,
  deriveLengthBoundariesFromObservedCatalog,
  deriveRuntimeStringBoundaryFromObservedCatalog,
  deriveIdentifierAlphabetFromObservedSeeds,
  deriveSpecialCharactersFromRuntimeEvidence,
  deriveMoneyProbeStringsFromObservedCatalog,
  deriveAdversarialPayloadsFromObservedEvidence,
  discoverEnumMembersFromCandidateEvidence,
  detectBrlCurrencyFromObservedInput,
} from './__parts__/dynamic-reality-kernel/strategy-probes';
export {
  deriveStringIdentitySeedsFromCandidate,
  hashStringToObservedSeed,
  discoverSecurityBreakTypePatternsFromEvidence,
  discoverIsolationBreakTypePatternsFromEvidence,
  discoverRecoveryBreakTypePatternsFromEvidence,
  discoverPerformanceBreakTypePatternsFromEvidence,
  discoverObservabilityBreakTypePatternsFromEvidence,
  discoverRuntimeBreakTypePatternsFromEvidence,
  discoverCheckerGapTypesFromEvidence,
  discoverAllObservedGateNames,
  discoverGateLaneFromObservedStructure,
  derivePriorityFromObservedContext,
  deriveProductImpactFromObservedScope,
  discoverAllObservedArtifactFilenames,
  discoverSourceLabelFromObservedContext,
  deriveUnitIdFromObservedKind,
  discoverExternalReceiverTokensFromEvidence,
  discoverDirectorySkipHintsFromEvidence,
  discoverSourceExtensionsFromObservedTypescript,
  deriveCapabilityIdFromObservedPath,
} from './__parts__/dynamic-reality-kernel/patterns-utilities';
