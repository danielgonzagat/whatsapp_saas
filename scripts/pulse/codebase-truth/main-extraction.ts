import type { PulseCodebaseTruth, PulseDiscoveredModule } from '../../types.truth';
import type { PulseConfig, PulseManifest } from '../../types.manifest';
import type { CoreParserData } from '../../functional-map-types';
import { buildFunctionalMap } from '../../functional-map';
import {
  deriveUnitValue,
  deriveZeroValue,
} from '../../dynamic-reality-kernel/catalog-arithmetic';
import {
  isUserFacingGroup,
  unique,
  buildDiscoveredFlows,
  buildDivergence,
  buildPageSemanticProfile,
} from '../../codebase-truth.analysis';
import {
  buildPageSummary,
  getRouteRoot,
  _isComplexity,
  matchDeclaredModule,
  classifyModuleState,
  summarizeModule,
  buildGenericModuleAlias,
  type ModuleBucket,
} from './internals';

/** Extract codebase truth. */
export function extractCodebaseTruth(
  config: PulseConfig,
  coreData: CoreParserData,
  manifest: PulseManifest | null,
): PulseCodebaseTruth {
  const fmap = buildFunctionalMap(config, coreData);
  const pageSummaries = fmap.pages.map(buildPageSummary);
  const buckets = new Map<string, ModuleBucket>();

  for (const page of pageSummaries) {
    const bucket = buckets.get(page.moduleKey) || {
      key: page.moduleKey,
      name: page.moduleName,
      routeRoots: [],
      groups: [],
      userFacing: false,
      shellComplexity: page.shellComplexity,
      pageCount: deriveZeroValue(),
      totalInteractions: deriveZeroValue(),
      functioningInteractions: deriveZeroValue(),
      facadeInteractions: deriveZeroValue(),
      brokenInteractions: deriveZeroValue(),
      incompleteInteractions: deriveZeroValue(),
      absentInteractions: deriveZeroValue(),
      apiBoundInteractions: deriveZeroValue(),
      backendBoundInteractions: deriveZeroValue(),
      persistedInteractions: deriveZeroValue(),
      totalDataSources: deriveZeroValue(),
      backedDataSources: deriveZeroValue(),
      semanticTokens: [],
      structuralTokens: [],
    };

    bucket.routeRoots = unique([...bucket.routeRoots, getRouteRoot(page.route, page.group)]);
    bucket.groups = unique([...bucket.groups, page.group]);
    bucket.userFacing = bucket.userFacing || isUserFacingGroup(page.group);
    bucket.pageCount += deriveUnitValue();
    bucket.totalInteractions += page.totalInteractions;
    bucket.functioningInteractions += page.functioningInteractions;
    bucket.facadeInteractions += page.facadeInteractions;
    bucket.brokenInteractions += page.brokenInteractions;
    bucket.incompleteInteractions += page.incompleteInteractions;
    bucket.absentInteractions += page.absentInteractions;
    bucket.apiBoundInteractions += page.apiBoundInteractions;
    bucket.backendBoundInteractions += page.backendBoundInteractions;
    bucket.persistedInteractions += page.persistedInteractions;
    bucket.totalDataSources += page.totalDataSources;
    bucket.backedDataSources += page.backedDataSources;
    bucket.semanticTokens = unique([...bucket.semanticTokens, ...(page.semanticTokens || [])]);
    bucket.structuralTokens = unique([
      ...bucket.structuralTokens,
      ...(page.structuralTokens || []),
    ]);
    if (
      _isComplexity(page.shellComplexity, 'rich') ||
      (_isComplexity(page.shellComplexity, 'medium') &&
        _isComplexity(bucket.shellComplexity, 'light'))
    ) {
      bucket.shellComplexity = page.shellComplexity;
    }
    buckets.set(page.moduleKey, bucket);
  }

  const discoveredModules = [...buckets.values()]
    .map<PulseDiscoveredModule>((bucket) => {
      const declaredModule = matchDeclaredModule(bucket, manifest);
      const state = classifyModuleState(bucket);
      return {
        ...bucket,
        declaredModule,
        state,
        notes: summarizeModule(bucket, state, declaredModule),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const discoveredFlows = buildDiscoveredFlows(
    fmap.pages,
    manifest,
    buildPageSemanticProfile,
    buildGenericModuleAlias,
  );
  const divergence = buildDivergence(
    pageSummaries,
    discoveredModules,
    discoveredFlows,
    manifest,
    coreData,
  );

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalPages: pageSummaries.length,
      userFacingPages: pageSummaries.filter((page) => isUserFacingGroup(page.group)).length,
      discoveredModules: discoveredModules.length,
      discoveredFlows: discoveredFlows.length,
      blockerCount: divergence.blockerCount,
      warningCount: divergence.warningCount,
    },
    pages: pageSummaries,
    discoveredModules,
    discoveredFlows,
    divergence,
  };
}
