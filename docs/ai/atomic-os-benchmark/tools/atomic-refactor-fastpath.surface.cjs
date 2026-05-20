'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  loadTypeScript, relPath, abs, lineCount, readText,
} = require('./atomic-refactor-fastpath.io.cjs');

function shellQuote(value) {
  return "'" + String(value).replaceAll("'", "'\\''") + "'";
}

function command(parts) {
  return parts.filter((part) => part !== null && part !== undefined && part !== '').map(shellQuote).join(' ');
}

function optionalFlag(flag, value) {
  return value === null || value === undefined ? [] : [flag, String(value)];
}

function classSurfaceInventory(text, fileName, worktree) {
  const ts = loadTypeScript(worktree);
  if (!ts) return { available: false, reason: 'typescript_unavailable' };
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let classNode = null;

  function nameText(node) {
    if (!node) return null;
    if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text;
    return node.getText(source).replace(/^['"]|['"]$/g, '');
  }

  function hasModifier(node, kinds) {
    return (node.modifiers || []).some((modifier) => kinds.includes(modifier.kind));
  }

  function visit(node) {
    if (!classNode && ts.isClassDeclaration(node)) classNode = node;
    ts.forEachChild(node, visit);
  }

  visit(source);
  if (!classNode) return { available: false, reason: 'class_not_found' };
  const constructorNode = classNode.members.find((member) => ts.isConstructorDeclaration(member)) || null;
  const constructorParamProperties = constructorNode
    ? constructorNode.parameters
        .filter((parameter) => hasModifier(parameter, [ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.ProtectedKeyword, ts.SyntaxKind.PublicKeyword, ts.SyntaxKind.ReadonlyKeyword]))
        .map((parameter) => ({
          name: nameText(parameter.name),
          optional: Boolean(parameter.questionToken),
          type: parameter.type ? parameter.type.getText(source) : null,
        }))
        .filter((parameter) => parameter.name)
    : [];
  const privateFields = classNode.members
    .filter((member) => ts.isPropertyDeclaration(member))
    .map((member) => ({
      name: nameText(member.name),
      optional: Boolean(member.questionToken),
      type: member.type ? member.type.getText(source) : null,
      visibility: hasModifier(member, [ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.ProtectedKeyword]) ? 'private' : 'public',
    }))
    .filter((field) => field.name);
  const methodSurfaces = classNode.members
    .filter((member) => ts.isMethodDeclaration(member))
    .map((member) => {
      const start = source.getLineAndCharacterOfPosition(member.getStart(source)).line + 1;
      const end = source.getLineAndCharacterOfPosition(member.getEnd()).line + 1;
      const isPrivate = hasModifier(member, [ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.ProtectedKeyword]);
      return {
        name: nameText(member.name),
        visibility: isPrivate ? 'private' : 'public',
        lines: end - start + 1,
      };
    })
    .filter((method) => method.name);
  const publicMethods = methodSurfaces.filter((method) => method.visibility === 'public').map((method) => method.name);
  const privateMethods = methodSurfaces.filter((method) => method.visibility === 'private');
  const postConstructorAssignedFields = new Set();
  for (const member of classNode.members) {
    if (ts.isConstructorDeclaration(member)) continue;
    function scanAssignments(node) {
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isPropertyAccessExpression(node.left) &&
        node.left.expression.kind === ts.SyntaxKind.ThisKeyword
      ) {
        postConstructorAssignedFields.add(node.left.name.text);
      }
      ts.forEachChild(node, scanAssignments);
    }
    scanAssignments(member);
  }
  return {
    available: true,
    className: nameText(classNode.name),
    constructorParamProperties,
    privateFields,
    publicMethods,
    privateMethods,
    postConstructorAssignedFields: [...postConstructorAssignedFields].sort(),
  };
}

function facadeDelegationShapePlan(surface, clusters, retainedFacadeSymbols) {
  if (!surface.available) {
    return { available: false, reason: surface.reason, candidates: [] };
  }
  const dependencyCount = surface.constructorParamProperties.length + surface.privateFields.length;
  const delegateRoots = clusters.map((cluster) => cluster.root).filter(Boolean);
  const retainedPublicLeaves = retainedFacadeSymbols.map((symbol) => symbol.name);
  const publicDelegateMethods = surface.publicMethods.filter((name) => !retainedPublicLeaves.includes(name));
  const privateMethods = Array.isArray(surface.privateMethods) ? surface.privateMethods : [];
  const privateMethodSurface = sumValues(privateMethods, (method) => method.lines);
  const repeatedDependencyPressure = dependencyCount * publicDelegateMethods.length;
  const extractedRootPressure = dependencyCount * delegateRoots.length;
  const runtimeOwnerClassEconomy = {
    privateMethodSurface,
    dependencySurface: dependencyCount,
    publicDelegateMethodCount: publicDelegateMethods.length,
    extractedRootCount: delegateRoots.length,
    repeatedDependencyPressure,
    extractedRootPressure,
    strictDependencySurfaceWin: extractedRootPressure < repeatedDependencyPressure,
    pass: privateMethodSurface > 0 && extractedRootPressure < repeatedDependencyPressure,
    interpretation: 'Runtime-owner classes are preferred only when observed private facade helper surface exists and owner constructor dependency wiring is strictly smaller than direct per-method function delegation; dependency-surface ties stay with direct functions to avoid class/private-method module bloat.',
  };
  const preferRuntimeOwnerClass = runtimeOwnerClassEconomy.pass;
  const preferCachedDelegate = !preferRuntimeOwnerClass && extractedRootPressure < repeatedDependencyPressure;
  return {
    available: true,
    dependencyCount,
    publicDelegateMethods,
    retainedPublicLeaves,
    delegateRoots,
    privateMethods,
    privateMethodSurface,
    repeatedDependencyPressure,
    extractedRootPressure,
    runtimeOwnerClassEconomy,
    preferredShape: preferRuntimeOwnerClass ? 'runtime_owner_class_delegation' : (preferCachedDelegate ? 'cached_delegate_instance' : 'direct_function_delegation'),
    candidates: [
      {
        shape: 'runtime_owner_class_delegation',
        signal: 'Constructor creates owner runtime classes that absorb owner-local private helper/callback surface; public facade methods delegate to those owners.',
        winsWhen: 'Observed private facade helper surface exists and owner constructor dependency wiring is strictly smaller than direct function delegation; ties remain direct because class/private-method surface can enlarge the runtime module.',
      },
      {
        shape: 'cached_delegate_instance',
        signal: 'Constructor creates one delegate/core object for dependency-heavy extracted roots; public facade methods call that object.',
        winsWhen: 'The measured dependency wiring is reused across public methods or extracted roots.',
      },
      {
        shape: 'direct_function_delegation',
        signal: 'Public facade methods call extracted module functions directly with the smallest measured dependency object.',
        winsWhen: 'The dependency bundle is small or retained public leaves dominate the facade.',
      },
      {
        shape: 'private_dependency_helper',
        signal: 'A private helper builds the dependency bundle.',
        winsWhen: 'Only keep this if AST/line measurement proves it is smaller than cached delegate and direct function shapes.',
      },
    ],
  };
}

function sumValues(items, select) {
  return items.reduce((total, item) => total + Number(select(item) || 0), 0);
}

function maxValue(items, select) {
  if (items.length === 0) return 0;
  return Math.max(...items.map((item) => Number(select(item) || 0)));
}

function positiveScale(values, fallback) {
  const numeric = values.map((value) => Math.abs(Number(value) || 0)).filter((value) => value > 0);
  const fallbackValue = Math.abs(Number(fallback) || 0);
  if (fallbackValue > 0) numeric.push(fallbackValue);
  return numeric.length > 0 ? Math.max(...numeric) : 1;
}

function pressureFamily(category) {
  return category.endsWith('_economy') ? 'economy' : category;
}

function rankMacroShapeCandidates(candidates, context) {
  const metricSpec = [
    { key: 'productSourceFileCount', direction: 'lower', category: 'surface_economy', scale: 'observed' },
    { key: 'estimatedFacadePressure', direction: 'lower', category: 'surface_economy', scale: 'target' },
    { key: 'estimatedInventoryPressure', direction: 'lower', category: 'surface_economy', scale: 'target' },
    { key: 'dependencyBoundaryPressure', direction: 'lower', category: 'surface_economy', scale: 'observed' },
    { key: 'writeBatchFileCount', direction: 'lower', category: 'execution_economy', scale: 'observed' },
    { key: 'largestModuleLines', direction: 'lower', category: 'modularity', scale: 'target' },
    { key: 'responsibilityIsolation', direction: 'higher', category: 'modularity', scale: 'observed' },
  ];
  const families = [...new Set(metricSpec.map((metric) => pressureFamily(metric.category)))];
  for (const candidate of candidates) {
    candidate.metricWins = [];
    candidate.metricLosses = [];
    candidate.categoryWins = {};
    candidate.pressureScore = { total: 0, byFamily: {}, byCategory: {}, byMetric: {} };
  }
  for (const metric of metricSpec) {
    const values = candidates.map((candidate) => Number(candidate.metrics[metric.key] || 0));
    const bestValue = metric.direction === 'lower' ? Math.min(...values) : Math.max(...values);
    const worstValue = metric.direction === 'lower' ? Math.max(...values) : Math.min(...values);
    const scale = positiveScale(values, metric.scale === 'target' ? context.currentTargetLines : null);
    for (const candidate of candidates) {
      const value = Number(candidate.metrics[metric.key] || 0);
      const regret = metric.direction === 'lower'
        ? (value - bestValue) / scale
        : (bestValue - value) / scale;
      const boundedRegret = Math.max(0, regret);
      candidate.pressureScore.byMetric[metric.key] = Number(boundedRegret.toFixed(6));
      const categoryBucket = candidate.pressureScore.byCategory[metric.category] || { total: 0, count: 0 };
      categoryBucket.total += boundedRegret;
      categoryBucket.count += 1;
      candidate.pressureScore.byCategory[metric.category] = categoryBucket;
      const family = pressureFamily(metric.category);
      const familyBucket = candidate.pressureScore.byFamily[family] || { total: 0, count: 0 };
      familyBucket.total += boundedRegret;
      familyBucket.count += 1;
      candidate.pressureScore.byFamily[family] = familyBucket;
      if (value === bestValue && bestValue !== worstValue) {
        candidate.metricWins.push(metric.key);
        candidate.categoryWins[metric.category] = (candidate.categoryWins[metric.category] || 0) + 1;
      }
      if (value === worstValue && bestValue !== worstValue) candidate.metricLosses.push(metric.key);
    }
  }
  for (const candidate of candidates) {
    const byCategory = {};
    for (const [category, bucket] of Object.entries(candidate.pressureScore.byCategory)) {
      byCategory[category] = Number((bucket.total / bucket.count).toFixed(6));
    }
    let total = 0;
    const byFamily = {};
    for (const family of families) {
      const bucket = candidate.pressureScore.byFamily[family] || { total: 0, count: 0 };
      const familyRegret = bucket.count > 0 ? bucket.total / bucket.count : 0;
      byFamily[family] = Number(familyRegret.toFixed(6));
      total += familyRegret;
    }
    candidate.pressureScore.byCategory = byCategory;
    candidate.pressureScore.byFamily = byFamily;
    const worstFamilyRegret = Math.max(...Object.values(byFamily));
    candidate.pressureScore.worstFamily = Number(worstFamilyRegret.toFixed(6));
    candidate.pressureScore.total = Number((total / families.length).toFixed(6));
  }
  for (const candidate of candidates) {
    const executionEconomyLosses = candidate.metricLosses.filter((metric) => metric === 'productSourceFileCount' || metric === 'writeBatchFileCount');
    const surfaceEconomyWins = candidate.metricWins.filter((metric) => metric === 'estimatedFacadePressure' || metric === 'estimatedInventoryPressure' || metric === 'dependencyBoundaryPressure');
    const surfaceEconomyLosses = candidate.metricLosses.filter((metric) => metric === 'estimatedFacadePressure' || metric === 'estimatedInventoryPressure' || metric === 'dependencyBoundaryPressure');
    const economyTradeoffDebt = (executionEconomyLosses.length > 0 || surfaceEconomyLosses.length > 0) && surfaceEconomyWins.length === 0;
    candidate.operationalTradeoff = {
      executionEconomyLosses,
      surfaceEconomyLosses,
      surfaceEconomyWins,
      economyTradeoffDebt,
      interpretation: economyTradeoffDebt
        ? 'This shape improves another family by spending extra operational economy without a measured surface-economy win; keep it as a candidate, not the default execution path.'
        : 'This shape is balanced enough for default ranking because economy losses are absent or offset by measured surface-economy wins.',
    };
  }
  return [...candidates].sort((left, right) => {
    const leftPass = left.dynamicReleasePass ? 1 : 0;
    const rightPass = right.dynamicReleasePass ? 1 : 0;
    if (leftPass !== rightPass) return rightPass - leftPass;
    if (left.pressureScore.worstFamily !== right.pressureScore.worstFamily) {
      return left.pressureScore.worstFamily - right.pressureScore.worstFamily;
    }
    if (left.pressureScore.total !== right.pressureScore.total) {
      return left.pressureScore.total - right.pressureScore.total;
    }
    const leftTradeoffDebt = left.operationalTradeoff && left.operationalTradeoff.economyTradeoffDebt ? 1 : 0;
    const rightTradeoffDebt = right.operationalTradeoff && right.operationalTradeoff.economyTradeoffDebt ? 1 : 0;
    if (leftTradeoffDebt !== rightTradeoffDebt) return leftTradeoffDebt - rightTradeoffDebt;
    const leftFileCount = Number(left.metrics.productSourceFileCount || 0);
    const rightFileCount = Number(right.metrics.productSourceFileCount || 0);
    if (leftFileCount !== rightFileCount) return leftFileCount - rightFileCount;
    const leftBatchCount = Number(left.metrics.writeBatchFileCount || 0);
    const rightBatchCount = Number(right.metrics.writeBatchFileCount || 0);
    if (leftBatchCount !== rightBatchCount) return leftBatchCount - rightBatchCount;
    return left.shape.localeCompare(right.shape);
  });
}


function supportModulePlan(clusters, scopePrefix, targetExt) {
  const supportMembers = [];
  const clusterPlans = [];
  for (const cluster of clusters) {
    const members = Array.isArray(cluster.memberDetails) ? cluster.memberDetails : [];
    const supportNames = new Set();
    for (const member of members) {
      const calls = Array.isArray(member.calls) ? member.calls : [];
      const lines = Number(member.lines || 0);
      const isRoot = member.name === cluster.root || member.assignmentReason === 'root';
      if (!isRoot && !member.isPublicSurface && calls.length === 0 && lines > 0) {
        supportNames.add(member.name);
        supportMembers.push({
          cluster: cluster.cluster,
          name: member.name,
          lines,
          assignmentReason: member.assignmentReason || 'observed-leaf-support',
        });
      }
    }
    const coreMembers = members.filter((member) => !supportNames.has(member.name));
    const coreSymbols = coreMembers.map((member) => member.name).filter(Boolean);
    const coreObservedLines = sumValues(coreMembers, (member) => member.lines);
    clusterPlans.push({
      cluster,
      coreSymbols,
      supportSymbols: [...supportNames],
      coreObservedLines,
    });
  }
  const supportLines = sumValues(supportMembers, (member) => member.lines);
  const largestBeforeSupport = maxValue(clusters, (cluster) => cluster.totalObservedLines || cluster.rootLines || 0);
  const largestCoreLines = maxValue(clusterPlans, (plan) => plan.coreObservedLines);
  const largestModuleLinesAfterSupport = Math.max(largestCoreLines, supportLines);
  const supportFile = scopePrefix + '-support' + (targetExt || '.ts');
  const supportSymbols = supportMembers.map((member) => member.name);
  const [firstCluster, ...remainingClusters] = clusters;
  const multiClusterTopology = Boolean(firstCluster && remainingClusters.length);
  const supportReducesLargestModule = largestModuleLinesAfterSupport < largestBeforeSupport;
  const supportReleasesIndependentTopology = Boolean(supportReducesLargestModule);
  const available = supportMembers.length > 0 && supportReleasesIndependentTopology;
  const availabilityReason = supportMembers.length === 0
    ? 'no_leaf_support_symbols'
    : (supportReleasesIndependentTopology
        ? (multiClusterTopology
            ? 'support_releases_multi_cluster_largest_module_pressure'
            : 'support_releases_single_cluster_largest_module_pressure')
        : 'support_does_not_release_largest_module_pressure');
  return {
    available,
    availabilityReason,
    multiClusterTopology,
    supportReleasesIndependentTopology,
    supportFile,
    supportLines,
    supportSymbols,
    supportMembers,
    largestBeforeSupport,
    largestCoreLines,
    largestModuleLinesAfterSupport,
    clusterPlans,
    selectedDecompositionTemplate: [
      ...clusterPlans.map((plan) => ({
        file: plan.cluster.fileHint,
        responsibility: 'Extract dependency-cohesive core rooted at ' + plan.cluster.root + ': ' + plan.coreSymbols.join(', '),
        observedLines: plan.coreObservedLines,
        preserveTogether: 'Keep these core symbols together unless validation proves another observed dependency root owns one member.',
        splitWhen: 'Leaf support moves when topology lowers module pressure; no file or line budget.',
        symbols: plan.coreSymbols,
        supportSymbolsMoved: plan.supportSymbols,
      })),
      {
        file: supportFile,
        responsibility: 'Extract observed private leaf support symbols shared by the selected macro split: ' + supportSymbols.join(', '),
        observedLines: supportLines,
        preserveTogether: 'Support stays grouped while leaf-shaped; coupling evidence moves it to its dependency owner.',
        splitWhen: 'This support module exists because measured topology reduces largest-module pressure, not because of a fixed helper-file rule.',
        symbols: supportSymbols,
      },
    ],
  };
}


module.exports = {
  shellQuote, command, optionalFlag,
  classSurfaceInventory, facadeDelegationShapePlan,
  sumValues, maxValue, positiveScale, pressureFamily,
  rankMacroShapeCandidates, supportModulePlan,
};
