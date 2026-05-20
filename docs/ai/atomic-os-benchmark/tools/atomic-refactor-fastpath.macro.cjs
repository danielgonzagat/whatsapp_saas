'use strict';

const { rankMacroShapeCandidates } = require('./atomic-refactor-fastpath.surface.cjs');
const {
  retainedRootInternalCompactionPlan,
  dominantPublicRootRetentionPlan,
} = require('./atomic-refactor-fastpath.shape.cjs');

function macroRefactorShapePlan(surface, clusters, retainedFacadeSymbols, scopePrefix, targetExt, currentTargetLines, targetText = '') {
  if (!clusters || clusters.length === 0) {
    return {
      available: false,
      reason: 'no_observed_clusters',
      preferredShape: null,
      candidates: [],
      selectedDecompositionTemplate: null,
    };
  }
  const dependencyCount = surface.available
    ? surface.constructorParamProperties.length + surface.privateFields.length
    : 0;
  const publicMethodCount = surface.available ? surface.publicMethods.length : 0;
  const retainedFacadeLinePressure = sumValues(retainedFacadeSymbols, (symbol) => symbol.lines);
  const clusterLineTotal = sumValues(clusters, (cluster) => cluster.totalObservedLines || cluster.rootLines || 0);
  const largestClusterLines = maxValue(clusters, (cluster) => cluster.totalObservedLines || cluster.rootLines || 0);
  const clusterCount = clusters.length;
  const allSymbols = clusters.flatMap((cluster) => cluster.symbols || []);
  const runtimeFile = scopePrefix + '-runtime' + (targetExt || '.ts');
  const splitTemplate = clusters.map((cluster) => ({
    file: cluster.fileHint,
    responsibility: 'Extract dependency-cohesive cluster rooted at ' + cluster.root + ': ' + cluster.symbols.join(', '),
    observedLines: cluster.totalObservedLines,
    symbols: cluster.symbols || [],
    preserveTogether: 'Keep these symbols together unless a validation or scorecard signal proves that one member belongs to another observed dependency root.',
    splitWhen: 'Split only along an observed dependency edge or repeated validation failure, not by a fixed file or line budget.',
  }));
  const singleTemplate = [{
    file: runtimeFile,
    responsibility: 'single_runtime: measured economy winner for this topology.',
    observedLines: clusterLineTotal,
    preserveTogether: 'preserve observed clusters as internal sections.',
    splitWhen: 'split when measured Pareto pressure changes winner.',
    symbols: allSymbols,
  }];
  const supportPlan = supportModulePlan(clusters, scopePrefix, targetExt);
  const dominantRootRetentionPlan = dominantPublicRootRetentionPlan(clusters, scopePrefix, targetExt, targetText);
  const candidates = [
    {
      shape: 'single_runtime_module',
      selectedDecompositionTemplate: singleTemplate,
      metrics: {
        productSourceFileCount: 1,
        estimatedFacadePressure: retainedFacadeLinePressure + dependencyCount + publicMethodCount + singleTemplate.length,
        estimatedInventoryPressure: clusterLineTotal + dependencyCount + publicMethodCount + retainedFacadeLinePressure,
        dependencyBoundaryPressure: dependencyCount,
        writeBatchFileCount: 2,
        largestModuleLines: clusterLineTotal,
        responsibilityIsolation: 1,
      },
      dynamicReleasePass: clusterLineTotal < currentTargetLines,
      reason: 'single runtime wins measured economy after release.',
    },
    {
      shape: 'dependency_split_modules',
      selectedDecompositionTemplate: splitTemplate,
      metrics: {
        productSourceFileCount: clusterCount,
        estimatedFacadePressure: retainedFacadeLinePressure + dependencyCount + publicMethodCount + clusterCount,
        estimatedInventoryPressure: clusterLineTotal + (dependencyCount * clusterCount) + (publicMethodCount * clusterCount) + retainedFacadeLinePressure,
        dependencyBoundaryPressure: dependencyCount * clusterCount,
        writeBatchFileCount: clusterCount + 1,
        largestModuleLines: largestClusterLines,
        responsibilityIsolation: clusterCount,
      },
      dynamicReleasePass: largestClusterLines < currentTargetLines,
      reason: 'dependency split wins measured modularity pressure.',
    },
  ];
  if (dominantRootRetentionPlan.available) {
    const retainedDominantFacadePressure = dominantRootRetentionPlan.retainedRootLinesAfterInternalCompaction + retainedFacadeLinePressure;
    const dominantRetentionLargestModuleLines = Math.max(
      retainedDominantFacadePressure,
      dominantRootRetentionPlan.extractedLargestModuleLines,
    );
    candidates.push({
      shape: 'dominant_public_root_retention',
      selectedDecompositionTemplate: dominantRootRetentionPlan.selectedDecompositionTemplate,
      retainedFacadeRootSymbols: dominantRootRetentionPlan.retainedFacadeRootSymbols,
      metrics: {
        productSourceFileCount: dominantRootRetentionPlan.productSourceFileCount,
        estimatedFacadePressure:
          dominantRootRetentionPlan.retainedRootLinesAfterInternalCompaction +
          retainedFacadeLinePressure +
          dependencyCount +
          publicMethodCount +
          dominantRootRetentionPlan.productSourceFileCount,
        estimatedInventoryPressure:
          dominantRootRetentionPlan.extractedLineTotal +
          dominantRootRetentionPlan.retainedRootLinesAfterInternalCompaction +
          retainedFacadeLinePressure +
          (dependencyCount * dominantRootRetentionPlan.productSourceFileCount) +
          (publicMethodCount * dominantRootRetentionPlan.productSourceFileCount),
        dependencyBoundaryPressure: dependencyCount * dominantRootRetentionPlan.productSourceFileCount,
        writeBatchFileCount: dominantRootRetentionPlan.productSourceFileCount + 1,
        largestModuleLines: dominantRetentionLargestModuleLines,
        responsibilityIsolation: dominantRootRetentionPlan.productSourceFileCount + 1,
      },
      dynamicReleasePass: dominantRootRetentionPlan.extractedLineTotal > 0 && dominantRetentionLargestModuleLines < currentTargetLines,
      reason: 'dominant public root retention wins when extracting helpers and sibling roots reduces facade/churn without moving the largest orchestration body into a new owner module.',
      dominantRootRetentionPlan,
    });
  }
  if (supportPlan.available) {
    candidates.push({
      shape: 'dependency_split_with_support_module',
      selectedDecompositionTemplate: supportPlan.selectedDecompositionTemplate,
      metrics: {
        productSourceFileCount: clusterCount + 1,
        estimatedFacadePressure: retainedFacadeLinePressure + dependencyCount + publicMethodCount + supportPlan.selectedDecompositionTemplate.length,
        estimatedInventoryPressure: clusterLineTotal + (dependencyCount * clusterCount) + (publicMethodCount * clusterCount) + retainedFacadeLinePressure,
        dependencyBoundaryPressure: dependencyCount * clusterCount,
        writeBatchFileCount: clusterCount + 2,
        largestModuleLines: supportPlan.largestModuleLinesAfterSupport,
        responsibilityIsolation: clusterCount + 1,
      },
      dynamicReleasePass: supportPlan.largestModuleLinesAfterSupport < currentTargetLines,
      reason: 'support module wins when observed private leaf support reduces largest-module pressure without adding constructor dependency pressure.',
    });
  }
  const ranked = rankMacroShapeCandidates(candidates, { currentTargetLines });
  const preferred = ranked[0];
  const marginAmplifierPool = ranked.filter((candidate) => candidate.dynamicReleasePass && !(candidate.operationalTradeoff && candidate.operationalTradeoff.economyTradeoffDebt));
  const marginAmplifier = (marginAmplifierPool.length > 0 ? marginAmplifierPool : ranked)
    .sort((left, right) => {
      if (left.metrics.largestModuleLines !== right.metrics.largestModuleLines) return left.metrics.largestModuleLines - right.metrics.largestModuleLines;
      if (left.metrics.estimatedInventoryPressure !== right.metrics.estimatedInventoryPressure) return left.metrics.estimatedInventoryPressure - right.metrics.estimatedInventoryPressure;
      if (left.pressureScore.total !== right.pressureScore.total) return left.pressureScore.total - right.pressureScore.total;
      return left.shape.localeCompare(right.shape);
    })[0] || preferred;
  const single = candidates.find((candidate) => candidate.shape === 'single_runtime_module');
  const split = candidates.find((candidate) => candidate.shape === 'dependency_split_modules');
  const dominantRootRetention = candidates.find((candidate) => candidate.shape === 'dominant_public_root_retention');
  const support = candidates.find((candidate) => candidate.shape === 'dependency_split_with_support_module');
  const candidateComparison = {
    singleVsSplitLargestDelta: single.metrics.largestModuleLines - split.metrics.largestModuleLines,
    splitVsSingleInventoryDelta: split.metrics.estimatedInventoryPressure - single.metrics.estimatedInventoryPressure,
    splitVsSingleFileDelta: split.metrics.productSourceFileCount - single.metrics.productSourceFileCount,
    splitVsSingleBoundaryDelta: split.metrics.dependencyBoundaryPressure - single.metrics.dependencyBoundaryPressure,
  };
  if (dominantRootRetention) {
    candidateComparison.dominantRetentionVsSplitLargestDelta = dominantRootRetention.metrics.largestModuleLines - split.metrics.largestModuleLines;
    candidateComparison.dominantRetentionVsSplitInventoryDelta = dominantRootRetention.metrics.estimatedInventoryPressure - split.metrics.estimatedInventoryPressure;
    candidateComparison.dominantRetentionVsSplitFileDelta = dominantRootRetention.metrics.productSourceFileCount - split.metrics.productSourceFileCount;
    candidateComparison.dominantRetentionDominantRoot = dominantRootRetention.dominantRootRetentionPlan
      ? dominantRootRetention.dominantRootRetentionPlan.dominantRoot
      : null;
  }
  let supportLargestReduction = 0;
  let supportSurfaceCost = 0;
  let supportReleaseEconomyPass = false;
  if (support) {
    supportLargestReduction = split.metrics.largestModuleLines - support.metrics.largestModuleLines;
    supportSurfaceCost = supportPlan.supportLines || 0;
    supportReleaseEconomyPass = supportLargestReduction > supportSurfaceCost;
    candidateComparison.splitVsSupportLargestDelta = supportLargestReduction;
    candidateComparison.supportVsSplitInventoryDelta = support.metrics.estimatedInventoryPressure - split.metrics.estimatedInventoryPressure;
    candidateComparison.supportVsSplitFileDelta = support.metrics.productSourceFileCount - split.metrics.productSourceFileCount;
    candidateComparison.supportSurfaceCost = supportSurfaceCost;
    candidateComparison.supportReleaseEconomyPass = supportReleaseEconomyPass;
  }
  const balancedSupportReleasePlan = support && supportPlan.available && support.metrics.largestModuleLines < split.metrics.largestModuleLines && support.metrics.estimatedInventoryPressure <= split.metrics.estimatedInventoryPressure && supportReleaseEconomyPass
    ? {
        available: true,
        shape: support.shape,
        selectedDecompositionTemplate: support.selectedDecompositionTemplate,
        metrics: support.metrics,
        supportReleaseEconomy: {
          largestModuleReduction: supportLargestReduction,
          supportSurfaceCost,
          pass: true,
          interpretation: 'Support extraction is active only when the measured largest-module reduction is larger than the standalone support surface created to obtain it.',
        },
        decisionAuthority: 'derived from candidate metrics: support lowers largest-module pressure, does not increase estimated inventory pressure, and its largest-module reduction exceeds its own support surface cost',
        useWhen: 'Use when the previous benchmark loss is largest-module or runtime pressure and validation keeps source count, inventory, facade size, public API, spec diff, protected diff, and trace economy non-worse.',
      }
    : {
        available: false,
        supportReleaseEconomy: support
          ? {
              largestModuleReduction: supportLargestReduction,
              supportSurfaceCost,
              pass: supportReleaseEconomyPass,
              interpretation: 'Support extraction stays inactive when its standalone support surface is greater than or equal to the largest-module reduction it buys.',
            }
          : null,
        reason: support
          ? 'support candidate did not prove largest-module reduction greater than its standalone support surface without inventory pressure against the selected split candidate'
          : 'no support candidate available',
      };
  return {
    available: true,
    preferredShape: preferred.shape,
    selectedDecompositionTemplate: preferred.selectedDecompositionTemplate,
    retainedFacadeRootSymbols: preferred.retainedFacadeRootSymbols || [],
    dominantRootRetentionPlan: dominantRootRetentionPlan.available ? dominantRootRetentionPlan : { available: false, reason: dominantRootRetentionPlan.reason },
    marginAmplificationShape: marginAmplifier.shape,
    marginAmplificationTemplate: marginAmplifier.selectedDecompositionTemplate,
    marginAmplificationMetrics: marginAmplifier.metrics,
    currentTargetLines,
    measurements: {
      dependencyCount,
      publicMethodCount,
      retainedFacadeLinePressure,
      clusterCount,
      clusterLineTotal,
      largestClusterLines,
      supportPlan: {
        available: supportPlan.available,
        availabilityReason: supportPlan.availabilityReason,
        multiClusterTopology: supportPlan.multiClusterTopology,
        supportReleasesIndependentTopology: supportPlan.supportReleasesIndependentTopology,
        supportFile: supportPlan.supportFile,
        supportLines: supportPlan.supportLines,
        supportSymbols: supportPlan.supportSymbols,
        largestBeforeSupport: supportPlan.largestBeforeSupport,
        largestModuleLinesAfterSupport: supportPlan.largestModuleLinesAfterSupport,
      },
      dominantRootRetentionPlan: dominantRootRetentionPlan.available
        ? {
            available: true,
            dominantRoot: dominantRootRetentionPlan.dominantRoot,
            retainedRootLines: dominantRootRetentionPlan.retainedRootLines,
            retainedRootLinesAfterInternalCompaction: dominantRootRetentionPlan.retainedRootLinesAfterInternalCompaction,
            helperLines: dominantRootRetentionPlan.helperLines,
            helperObservedLines: dominantRootRetentionPlan.helperObservedLines,
            internalCompactionLineSurface: dominantRootRetentionPlan.internalCompactionLineSurface,
            internalCompactionPlan: dominantRootRetentionPlan.internalCompactionPlan,
            helperSymbols: dominantRootRetentionPlan.helperSymbols,
            productSourceFileCount: dominantRootRetentionPlan.productSourceFileCount,
            extractedLineTotal: dominantRootRetentionPlan.extractedLineTotal,
            extractedLargestModuleLines: dominantRootRetentionPlan.extractedLargestModuleLines,
            decisionAuthority: dominantRootRetentionPlan.decisionAuthority,
          }
        : { available: false, reason: dominantRootRetentionPlan.reason },
    },
    candidateComparison,
    balancedSupportReleasePlan,
    candidates: ranked.map((candidate) => ({
      shape: candidate.shape,
      reason: candidate.reason,
      dynamicReleasePass: candidate.dynamicReleasePass,
      metrics: candidate.metrics,
      metricWins: candidate.metricWins,
      metricLosses: candidate.metricLosses,
      pressureScore: candidate.pressureScore,
      operationalTradeoff: candidate.operationalTradeoff,
      selected: candidate.shape === preferred.shape,
      marginAmplifier: candidate.shape === marginAmplifier.shape,
    })),
    selectionRule: 'rank by dynamic release, then minimax family pressure regret, then average pressure regret; operational tradeoff debt is retained as candidate metadata and used only as a tie-breaker after measured pressure, not as a pre-pressure veto; facade pressure is measured as a first-class surface so dominant public root retention cannot win only by modularity while losing facade/inventory economy; dominant public root retention is generated from observed public-root/helper topology when it reduces churn/inventory pressure without fixed thresholds; marginAmplificationShape is the release-pass candidate with the lowest measured largest-module pressure; support extraction is generated from observed leaf-support topology, not fixed thresholds.'
  };
}


module.exports = { macroRefactorShapePlan };
