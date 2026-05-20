'use strict';

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function sourceChurn(worktree, sourceMetrics) {
  const changedSourceFiles = sourceMetrics.map((item) => item.file);
  const tracked = trackedNumstat(worktree, changedSourceFiles);
  const trackedFiles = new Set(tracked.map((item) => item.file));
  const untrackedSources = sourceMetrics.filter((item) => !trackedFiles.has(item.file));
  const trackedAdded = tracked.reduce((total, item) => total + item.added, 0);
  const trackedDeleted = tracked.reduce((total, item) => total + item.deleted, 0);
  const untrackedAdded = untrackedSources.reduce((total, item) => total + item.lines, 0);
  const finalInventoryLines = sourceMetrics.reduce((total, item) => total + item.lines, 0);
  const added = trackedAdded + untrackedAdded;
  const deleted = trackedDeleted;
  return {
    tracked,
    untracked: untrackedSources.map((item) => ({ file: item.file, added: item.lines })),
    added,
    deleted,
    net: added - deleted,
    directional: {
      trackedAdded,
      untrackedAdded,
      deletedFromTrackedSources: trackedDeleted,
      finalInventoryLines,
      interpretation: 'Compare additions, final inventory, facade size, and largest module separately; deletions from tracked sources may be desired when extracting a facade and must not be treated as automatic product loss.',
    },
  };
}

function extractionEconomy(sourceMetrics, target) {
  const extracted = sourceMetrics.filter((item) => item.file !== target);
  const extractedMedianLines = median(extracted.map((item) => item.lines));
  const supportModules = extractedMedianLines === null
    ? []
    : extracted.filter((item) => item.lines < extractedMedianLines);
  const supportModuleScatter = Math.max(0, supportModules.length - 1);
  const debt = supportModuleScatter > 0;
  return {
    extractedSourceCount: extracted.length,
    extractedMedianLines,
    supportModules,
    supportModuleScatter,
    debt,
    pass: !debt,
  };
}

function traceEconomy(sourceMetrics, traceData) {
  const inventory = typeof traceData === 'number'
    ? {
        rawTraceCount: traceData,
        traceFiles: [],
        macroManifests: [],
        macroCoveredTraceCount: 0,
        uncoveredTraceCount: traceData,
        macroCoveragePass: traceData === 0,
        consolidatedProductBatchUnits: [],
      }
    : traceData;
  const productBatchUnitCount = sourceMetrics.length;
  const derivedTraceCeiling = Math.max(1, productBatchUnitCount);
  const changedSourceFiles = new Set(sourceMetrics.map((item) => item.file));
  const consolidatedChangedUnits = (inventory.consolidatedProductBatchUnits || [])
    .filter((fileName) => changedSourceFiles.has(fileName));
  const consolidatedTraceCount = consolidatedChangedUnits.length > 0
    ? consolidatedChangedUnits.length
    : inventory.rawTraceCount;
  const effectiveTraceCount = inventory.macroCoveragePass && inventory.rawTraceCount > 0
    ? consolidatedTraceCount
    : inventory.rawTraceCount;
  const debt = effectiveTraceCount > derivedTraceCeiling;
  return {
    traceCount: inventory.rawTraceCount,
    effectiveTraceCount,
    productBatchUnitCount,
    derivedTraceCeiling,
    excessTraceCount: Math.max(0, effectiveTraceCount - derivedTraceCeiling),
    rawExcessTraceCount: Math.max(0, inventory.rawTraceCount - derivedTraceCeiling),
    macroTraceCoveragePass: inventory.macroCoveragePass,
    macroCoveredTraceCount: inventory.macroCoveredTraceCount,
    uncoveredTraceCount: inventory.uncoveredTraceCount,
    consolidatedProductBatchUnits: consolidatedChangedUnits,
    macroManifests: inventory.macroManifests,
    debt,
    pass: !debt,
    interpretation: 'Macro-refactor proof is evaluated by dynamically covered product batch units when a macro trace manifest covers every child trace; otherwise raw child traces remain the trust surface.',
  };
}


module.exports = { median, sourceChurn, extractionEconomy, traceEconomy };
