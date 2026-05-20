'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  runGit, relPath, abs, lineCount, readText,
} = require('./atomic-refactor-fastpath.io.cjs');
const {
  tokenRelated, tokenRelationScore,
} = require('./atomic-refactor-fastpath.inventory.cjs');

function symbolDependencyClusters(symbolSpans, fallbackSymbols, scopePrefix, targetExt) {
  if (!symbolSpans || symbolSpans.length === 0) {
    return fallbackSymbolClusters(fallbackSymbols, scopePrefix, targetExt);
  }
  const averageLines = symbolSpans.reduce((total, span) => total + span.lines, 0) / symbolSpans.length;
  const dominantRootNames = new Set(
    symbolSpans.filter((span) => span.lines > averageLines).map((span) => span.name),
  );
  const publicSurfaceNames = new Set(symbolSpans.filter((span) => span.isPublicSurface).map((span) => span.name));
  const retainedFacadeNames = new Set(
    symbolSpans
      .filter((span) => span.isPublicSurface && !dominantRootNames.has(span.name))
      .filter((span) => span.calls.length === 0 || span.calls.every((call) => publicSurfaceNames.has(call)))
      .map((span) => span.name),
  );
  const roots = symbolSpans
    .filter((span) => !retainedFacadeNames.has(span.name))
    .filter((span) => dominantRootNames.has(span.name) || (span.isPublicSurface && !span.calls.some((call) => dominantRootNames.has(call))))
    .sort((left, right) => right.lines - left.lines || left.name.localeCompare(right.name));
  const effectiveRoots = roots.length > 0 ? roots : [symbolSpans[0]];
  const clusters = new Map();

  function rootKey(root) {
    return splitName(root.name)[0] || root.fileHintToken || root.name.toLowerCase();
  }

  function ensureCluster(root) {
    const key = rootKey(root);
    if (!clusters.has(key)) {
      clusters.set(key, {
        cluster: key,
        root: root.name,
        rootLines: root.lines,
        totalObservedLines: 0,
        symbols: [],
        memberDetails: [],
        fileHint: scopePrefix + '-' + key + (targetExt || '.ts'),
        assignmentSource: 'dependency-graph',
      });
    }
    return clusters.get(key);
  }

  function addMember(cluster, span, reason) {
    if (cluster.symbols.includes(span.name)) return;
    cluster.symbols.push(span.name);
    cluster.memberDetails.push({
      name: span.name,
      lines: span.lines,
      calls: span.calls,
      isPublicSurface: span.isPublicSurface,
      startLine: span.startLine,
      endLine: span.endLine,
      startOffset: span.startOffset,
      endOffset: span.endOffset,
      assignmentReason: reason,
    });
    cluster.totalObservedLines += span.lines;
  }

  for (const root of effectiveRoots) {
    addMember(ensureCluster(root), root, 'root');
  }

  for (const span of symbolSpans) {
    if (retainedFacadeNames.has(span.name) || effectiveRoots.some((root) => root.name === span.name)) continue;
    const callers = effectiveRoots.filter((root) => root.calls.includes(span.name));
    const calledRoots = effectiveRoots.filter((root) => span.calls.includes(root.name));
    const tokenMatches = effectiveRoots.filter((root) => tokenRelationScore(splitName(span.name), splitName(root.name)) > 0);
    const candidates = [...callers, ...calledRoots, ...tokenMatches];
    const chosen = (candidates.length > 0 ? candidates : effectiveRoots)
      .sort((left, right) => right.lines - left.lines || left.name.localeCompare(right.name))[0];
    const reason = callers.includes(chosen)
      ? 'called-by-root'
      : calledRoots.includes(chosen)
        ? 'wrapper-calls-root'
        : tokenMatches.includes(chosen)
          ? 'name-token-affinity'
          : 'largest-root-fallback';
    addMember(ensureCluster(chosen), span, reason);
  }

  const clusterList = [...clusters.values()]
    .sort((left, right) => right.totalObservedLines - left.totalObservedLines || left.cluster.localeCompare(right.cluster));
  const retainedFacadeSymbols = symbolSpans
    .filter((span) => retainedFacadeNames.has(span.name))
    .map((span) => ({
      name: span.name,
      lines: span.lines,
      calls: span.calls || [],
      reason: 'public-leaf-facade-retained',
    }));
  const [singleCluster, ...remainingClusters] = clusterList;
  const singleDelegateTopology = Boolean(singleCluster && remainingClusters.length === 0);
  if (singleDelegateTopology && retainedFacadeSymbols.length > 0) {
    const retainedNames = new Set(retainedFacadeSymbols.map((symbol) => symbol.name));
    for (const span of symbolSpans.filter((candidate) => retainedNames.has(candidate.name))) {
      addMember(singleCluster, span, 'single-cluster-facade-retention-release');
    }
    return {
      clusters: clusterList
        .sort((left, right) => right.totalObservedLines - left.totalObservedLines || left.cluster.localeCompare(right.cluster)),
      retainedFacadeSymbols: [],
      facadeRetentionRelease: {
        applied: true,
        reason: 'single_delegate_cluster_preserves_public_api_by_delegation',
        releasedSymbols: [...retainedNames],
      },
    };
  }
  return {
    clusters: clusterList,
    retainedFacadeSymbols,
    facadeRetentionRelease: {
      applied: false,
      reason: singleDelegateTopology ? 'no_retained_public_leaves' : 'multiple_delegate_clusters_keep_leaf_retention_candidate',
      releasedSymbols: [],
    },
  };
}

function isSiblingRuntimeFile(rel, scopePrefix, targetRel, specRel, targetExt) {
  if (rel === targetRel || rel === specRel) return false;
  if (path.posix.extname(rel) !== (targetExt || '.ts')) return false;
  const scopeDir = path.posix.dirname(scopePrefix);
  const scopeBase = path.posix.basename(scopePrefix);
  if (path.posix.dirname(rel) !== scopeDir) return false;
  const baseName = path.posix.basename(rel);
  if (!baseName.startsWith(scopeBase)) return false;
  if (/(^|[.-])(spec|test)([.-]|$)|spec-helpers/.test(baseName)) return false;
  return true;
}

function siblingModuleInventory(worktree, scopePrefix, targetRel, specRel, targetExt) {
  const scopeDir = path.posix.dirname(scopePrefix);
  const scopeBase = path.posix.basename(scopePrefix);
  return runGit(worktree, ['ls-files', path.posix.join(scopeDir, scopeBase + '*' + (targetExt || '.ts'))])
    .filter((rel) => isSiblingRuntimeFile(rel, scopePrefix, targetRel, specRel, targetExt))
    .map((rel) => {
      const text = readText(abs(worktree, rel));
      const targetImportStem = './' + path.posix.basename(targetRel, targetExt || '.ts');
      if (/@Controller\s*\(/.test(text) || new RegExp('from\\s+[\"\']' + escapeRegExp(targetImportStem) + '[\"\']').test(text)) return null;
      const exportedRuntimeSymbols = symbolSpanInventory(text, abs(worktree, rel), worktree)
        .filter((span) => span.isPublicSurface)
        .map((span) => ({ name: span.name, lines: span.lines }));
      const suffix = path.posix.basename(rel, targetExt || '.ts').slice(scopeBase.length);
      const moduleTokens = [...new Set([
        ...splitName(suffix),
        ...exportedRuntimeSymbols.flatMap((symbol) => splitName(symbol.name)),
      ])];
      return {
        file: rel,
        lines: lineCount(abs(worktree, rel)),
        exportedRuntimeSymbols,
        moduleTokens,
      };
    })
    .filter((module) => module && module.exportedRuntimeSymbols.length > 0);
}

function clusterMemberDetails(clusterPlan) {
  return clusterPlan.clusters.flatMap((cluster) => {
    const details = Array.isArray(cluster.memberDetails) && cluster.memberDetails.length > 0
      ? cluster.memberDetails
      : (cluster.symbols || []).map((name) => ({ name, lines: 0, calls: [], isPublicSurface: false, assignmentReason: 'symbol-list' }));
    return details.map((detail) => ({ ...detail, cluster: cluster.cluster }));
  });
}

function bestSiblingModuleForSymbol(symbol, modules) {
  const symbolTokens = splitName(symbol.name);
  return modules
    .map((module) => ({
      module,
      score: tokenRelationScore(symbolTokens, module.moduleTokens),
    }))
    .filter((candidate) => candidate.score > 1)
    .sort((left, right) => right.score - left.score || left.module.lines - right.module.lines || left.module.file.localeCompare(right.module.file))[0] || null;
}

function residualModuleFile(scopePrefix, targetExt) {
  return scopePrefix + '-residual.helpers' + (targetExt || '.ts');
}

function planSiblingModuleReuse(worktree, scopePrefix, targetRel, specRel, targetExt, clusterPlan) {
  const modules = siblingModuleInventory(worktree, scopePrefix, targetRel, specRel, targetExt);
  const memberDetails = clusterMemberDetails(clusterPlan);
  const assignments = [];
  for (const symbol of memberDetails) {
    if (!symbol.isPublicSurface) continue;
    const match = bestSiblingModuleForSymbol(symbol, modules);
    if (!match) continue;
    assignments.push({
      symbol: symbol.name,
      lines: symbol.lines,
      existingModule: match.module.file,
      score: match.score,
      reason: 'public_symbol_matches_existing_runtime_sibling',
    });
  }
  const reusedNames = new Set(assignments.map((assignment) => assignment.symbol));
  const residualSymbols = memberDetails
    .filter((symbol) => !reusedNames.has(symbol.name))
    .map((symbol) => ({
      name: symbol.name,
      lines: symbol.lines,
      isPublicSurface: symbol.isPublicSurface,
      assignmentReason: symbol.assignmentReason,
    }));
  const existingModules = modules.map((module) => ({
    file: module.file,
    lines: module.lines,
    exportedRuntimeSymbols: module.exportedRuntimeSymbols.map((symbol) => symbol.name),
    reusedSymbols: assignments
      .filter((assignment) => assignment.existingModule === module.file)
      .map((assignment) => assignment.symbol),
  })).filter((module) => module.reusedSymbols.length > 0);
  const applied = existingModules.length > 0;
  return {
    available: modules.length > 0,
    applied,
    reason: applied ? 'existing_runtime_siblings_cover_public_surface' : (modules.length > 0 ? 'no_public_symbol_matched_existing_runtime_sibling' : 'no_existing_runtime_sibling_modules'),
    existingModules,
    reuseAssignments: assignments,
    residualObservedLines: sumValues(residualSymbols, (symbol) => symbol.lines),
    residualSymbols: residualSymbols.map((symbol) => symbol.name),
    residualWriteTargets: applied
      ? [{
          file: residualModuleFile(scopePrefix, targetExt),
          symbols: residualSymbols.map((symbol) => symbol.name),
          responsibility: 'Extract residual behavior not already covered by existing runtime sibling modules: ' + residualSymbols.map((symbol) => symbol.name).join(', '),
        }]
      : [],
  };
}


module.exports = {
  symbolDependencyClusters,
  isSiblingRuntimeFile,
  siblingModuleInventory,
  clusterMemberDetails,
  planSiblingModuleReuse,
};
