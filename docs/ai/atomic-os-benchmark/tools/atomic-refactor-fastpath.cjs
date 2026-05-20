#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const {
  parseArgs, findRepoRoot, runGit, findUp, loadTypeScript,
  relPath, abs, lineCount, readText,
} = require('./atomic-refactor-fastpath.io.cjs');
const {
  listTrackedSources, inferTarget, inferSpec, inferClassName, deriveScopePrefix,
  splitName, symbolInventory, lineNumberAt, findMatchingBrace, escapeRegExp,
  containsFunctionCall, astSymbolSpanInventory, symbolSpanInventory,
  tokenRelated, tokenRelationScore, fallbackSymbolClusters,
} = require('./atomic-refactor-fastpath.inventory.cjs');
const {
  symbolDependencyClusters, isSiblingRuntimeFile, siblingModuleInventory,
  clusterMemberDetails, planSiblingModuleReuse,
} = require('./atomic-refactor-fastpath.clusters.cjs');
const {
  shellQuote, command, optionalFlag, classSurfaceInventory,
  facadeDelegationShapePlan, supportModulePlan,
} = require('./atomic-refactor-fastpath.surface.cjs');
const {
  slugFromCommentTitle, retainedRootInternalCompactionPlan,
  dominantPublicRootRetentionPlan,
} = require('./atomic-refactor-fastpath.shape.cjs');
const { macroRefactorShapePlan } = require('./atomic-refactor-fastpath.macro.cjs');
const {
  directFirstWriteBlueprint, bestExportForSymbolName, pascalToken,
  ownerAliasFromFile, facadeImportPressurePlan, facadeDependencyBundleReusePlan,
} = require('./atomic-refactor-fastpath.blueprint.cjs');
const {
  firstObservableWritePlan, retainedPublicLeafReleaseEconomyPlan,
  compactExecutionBriefWithDynamicDominance, executionStartCapsule,
  minimalDispatchBrief, atomicWorkerBrief,
} = require('./atomic-refactor-fastpath.recipe.cjs');
const { buildExecutableFirstBatchRecipe } = require('./atomic-refactor-fastpath.recipe-batch.cjs');

function usage() {
  console.error('Usage: atomic-refactor-fastpath.cjs --worktree <abs> [--target <rel>] [--spec <rel>] [--class <ClassName>] [--max-target-lines <n>] [--max-file-lines <n>] [--policy-path <json>] [--json]');
  process.exit(2);
}


function main() {
  const args = parseArgs(process.argv.slice(2));
  const coordinatorRoot = process.env.ATOMIC_OS_REPO_ROOT || findRepoRoot(__dirname);
  const targetAbs = abs(args.worktree, args.target);
  const targetText = readText(targetAbs);
  const targetExt = path.posix.extname(args.target) || '.ts';
  const scopePrefix = deriveScopePrefix(args.target);
  const toolsDir = __dirname;
  const atomicBatch = path.join(toolsDir, 'atomic-batch.cjs');
  const scorecard = path.join(toolsDir, 'refactor-scorecard.cjs');
  const traceCheck = path.join(toolsDir, 'trace-isolation-check.cjs');
  const publicApiAudit = path.join(toolsDir, 'public-api-preservation-audit.cjs');
  const scopeCheck = path.join(toolsDir, 'scope-discipline-check.cjs');
  const typecheckImpactAudit = path.join(toolsDir, 'typecheck-impact-audit.cjs');
  const symbolSpans = symbolSpanInventory(targetText, targetAbs, args.worktree);
  const symbols = symbolSpans.length > 0 ? symbolSpans.map((span) => span.name) : symbolInventory(targetText);
  const dominantSpan = symbolSpans[0] || null;
  const clusterPlan = symbolDependencyClusters(symbolSpans, symbols, scopePrefix, targetExt);
  const clusters = clusterPlan.clusters;
  const facadeSurface = classSurfaceInventory(targetText, targetAbs, args.worktree);
  const facadeDelegationShape = facadeDelegationShapePlan(facadeSurface, clusters, clusterPlan.retainedFacadeSymbols);
  const macroRefactorShape = macroRefactorShapePlan(facadeSurface, clusters, clusterPlan.retainedFacadeSymbols, scopePrefix, targetExt, lineCount(targetAbs), targetText);
  const clusterTemplates = clusters.map((cluster) => ({
    file: cluster.fileHint,
    responsibility: 'Extract dependency-cohesive cluster rooted at ' + cluster.root + ': ' + cluster.symbols.join(', '),
    observedLines: cluster.totalObservedLines,
    preserveTogether: 'Keep these symbols together unless a validation or scorecard signal proves that one member belongs to another observed dependency root.',
    splitWhen: 'Split only along an observed dependency edge or repeated validation failure, not by a fixed file or line budget.',
  }));
  const fallbackTemplate = [{
    file: scopePrefix + '-extracted' + targetExt,
    responsibility: 'Extract the smallest cohesive private helper cluster found by code_outline.',
    splitWhen: 'Split only when validation or scorecard evidence shows mixed responsibilities.',
  }];
  const batchCalls = [
    { tool: 'code_file_stat', arguments: { file: targetAbs } },
    { tool: 'code_outline', arguments: { file: targetAbs } },
  ];
  const batchJsonl = batchCalls.map((call) => JSON.stringify(call)).join('\n');
  const scorecardCommand = command([
    'node',
    scorecard,
    '--worktree',
    args.worktree,
    '--target',
    args.target,
    ...optionalFlag('--class', args.className),
    ...optionalFlag('--spec', args.spec),
    ...optionalFlag('--max-target-lines', args.maxTargetLines),
    ...optionalFlag('--max-file-lines', args.maxFileLines),
    '--enforce-scope',
    '--allow-prefix',
    scopePrefix,
    '--allow-atomic-traces',
    ...(args.policyPath ? ['--fastpath-policy', args.policyPath, '--enforce-fastpath-policy'] : []),
    '--enforce-target-dominance-release',
    '--enforce-facade-private-helper-release',
    '--enforce-facade-type-surface-release',
    '--enforce-type-spillover-economy',
    '--enforce-extraction-economy',
    '--enforce-sibling-reuse',
    '--enforce-trace-economy',
    ...(args.className ? ['--enforce-public-api'] : []),
    '--json',
  ]);
  const publicApiAuditCommand = args.className
    ? command(['node', publicApiAudit, '--worktree', args.worktree, '--target', args.target, '--class', args.className, '--json'])
    : null;
  const scopeDisciplineCommand = command(['node', scopeCheck, '--worktree', args.worktree, '--allow-prefix', scopePrefix, '--allow-atomic-traces', '--json']);
  const traceIsolationCommand = command(['node', traceCheck, '--worktree', args.worktree, '--coordinator', coordinatorRoot, '--since', '<start-time>', '--json']);
  const targetPackageRoot = args.target.includes('/') ? args.target.split('/')[0] : '.';
  const typecheckCommand = targetPackageRoot === '.'
    ? ['npm', 'run', 'typecheck']
    : ['npm', '--prefix', targetPackageRoot, 'run', 'typecheck'];
  const typecheckImpactCommand = command(['node', typecheckImpactAudit, '--worktree', args.worktree, '--allow-prefix', scopePrefix, '--json', '--', ...typecheckCommand]);
  const siblingReusePlan = planSiblingModuleReuse(args.worktree, scopePrefix, args.target, args.spec, targetExt, clusterPlan);
  const directFirstWrite = directFirstWriteBlueprint(macroRefactorShape, facadeDelegationShape, clusterPlan.retainedFacadeSymbols, args, siblingReusePlan);
  directFirstWrite.facadeDelegationShape = facadeDelegationShape;
  directFirstWrite.executableFirstBatchRecipe = buildExecutableFirstBatchRecipe(directFirstWrite, facadeSurface, siblingReusePlan);
  const workerBrief = atomicWorkerBrief(directFirstWrite, scorecardCommand, publicApiAuditCommand, scopeDisciplineCommand, traceIsolationCommand, typecheckImpactCommand);
  const result = {
    worktree: args.worktree,
    policyPath: args.policyPath,
    target: targetAbs,
    targetRel: args.target,
    spec: args.spec ? abs(args.worktree, args.spec) : null,
    specRel: args.spec,
    currentTargetLines: lineCount(targetAbs),
    maxTargetLines: args.maxTargetLines,
    maxFileLines: args.maxFileLines,
    derivedScopePrefix: scopePrefix,
    derivedClassName: args.className,
    detectedSymbols: symbols,
    observedSymbolSpans: symbolSpans,
    dominantExtractionCandidate: dominantSpan,
    observedSymbolClusters: clusters,
    retainedFacadeSymbols: clusterPlan.retainedFacadeSymbols,
    facadeRetentionRelease: clusterPlan.facadeRetentionRelease,
    siblingReusePlan,
    facadeSurface,
    facadeDelegationShape,
    macroRefactorShape,
    directFirstWriteBlueprint: directFirstWrite,
    atomicWorkerBrief: workerBrief,
    dynamicPolicyInputs: {
      targetSource: process.argv.includes('--target') ? 'caller' : 'largest tracked source in worktree',
      specSource: args.spec ? 'caller-or-detected-adjacent-spec' : 'none detected',
      classSource: args.className ? 'caller-or-source-class-detection' : 'not detected',
      sizingSource: args.maxTargetLines || args.maxFileLines ? 'caller-provided flags only' : 'measurement-only, no embedded line ceiling',
      allowedScopeSource: 'derived from target file stem',
      toolPathSource: 'current tool directory',
      coordinatorSource: 'ATOMIC_OS_REPO_ROOT or discovered repo root',
      scorecardPolicySource: args.policyPath ? 'caller-provided fastpath policy path' : 'not provided; pass --policy-path when the caller wants generated scorecard commands to enforce this policy JSON',
    },
    constraints: [
      'Use only the derived allowed source prefix plus atomic trace files unless a focused validation proves a broader edit is required.',
      'Do not edit governance, package, workflow, benchmark tooling, or unrelated product surfaces from the worker worktree.',
      'Use atomic MCP writes for code and run the generated scorecard before declaring completion.',
      'For facade splits, the generated scorecard releases target dominance dynamically: the target cannot remain the largest changed source.',
      'For facade splits, keep single-use private helpers out of the facade; inline or move them because the scorecard detects this from AST usage.',
      'For facade splits, use dependency-cohesive clusters from the observed symbol call graph before falling back to token clusters.',
      'For macro-refactors, method-level ownership is planning granularity only; product batch units define write granularity and trace economy.',
      'Retain public leaf methods in the facade when extraction would create a single-purpose support module without releasing dominance.',
      'Preserve public API when a class is detected; if no class is detected, preserve exported call surface identified by code_outline.',
      'Treat this output as runtime policy compiled from the current worktree, not a reusable fixed architecture template.',
      'Avoid copying helper bodies across modules; export/import the dependency owner selected by the graph when a helper is needed in another cluster.',
      'Choose the facade delegation shape from measured surface pressure: cached delegate, direct functions, or private helper only when it is actually smallest.',
      'Macro refactor shape comes from measured Pareto pressure.',
    ],
    adaptiveExecutionPolicy: {
      progressSignals: ['target diff exists', 'atomic trace exists', 'scorecard was run', 'target dominance released', 'facade private helper surface released', 'extraction economy released', 'trace economy released', 'dependency clusters preserved or intentionally recompiled', 'facade delegation shape chosen from surface pressure', 'macro refactor shape chosen from measured Pareto pressure', 'public API audit was run when class was detected'],
      noProgressResponse: 'When progress signals stop advancing, create the selected modules from macroRefactorShape.selectedDecompositionTemplate, replace the facade once, then re-run scorecard and this policy compiler.',
      sizingAuthority: 'Only caller-provided max flags are enforced; target dominance release is derived from changed-source measurements, not a fixed line ceiling.',
      explorationLimit: 'Read files needed to preserve the detected public surface and focused behavior; extra reads must be tied to a failing validation.',
      dominanceResponse: dominantSpan
        ? 'If the target remains the largest changed source after validation, continue by extracting ' + dominantSpan.name + ' or the cohesive cluster that contains it.'
        : 'No dominant method body detected; use code_outline to choose the next cohesive extracted region.',
      facadeSurfaceResponse: 'If the facade keeps helper methods, compare the emitted facadeDelegationShape candidates and use the smallest measured delegation shape that preserves constructor identity.',
      macroShapeResponse: 'Follow macroRefactorShape.preferredShape unless validation moves the Pareto winner.',
      extractionEconomyResponse: 'If scorecard reports support-module scatter or dominant extraction bloat, merge support into its dependency owner or split only along an observed call-graph root.',
      traceEconomyResponse: 'If scorecard reports trace-economy debt, re-run the write as product batch units from executableFirstBatchRecipe.writeGranularityPlan; do not continue per-method writes.',
    },
    decompositionTemplate: macroRefactorShape.available && macroRefactorShape.selectedDecompositionTemplate
      ? macroRefactorShape.selectedDecompositionTemplate
      : (clusterTemplates.length > 0 ? clusterTemplates : fallbackTemplate),
    macroRefactorOperation: {
      name: 'dynamic_service_facade_split',
      preserve: [
        args.className ? 'class name: ' + args.className : 'detected exported surface from code_outline',
        args.className ? 'constructor injection shape for ' + args.className : 'constructor shape if present',
        args.className ? 'public method signatures for ' + args.className : 'exported function signatures',
        args.spec ? 'focused spec bytes: ' + args.spec : 'no adjacent focused spec detected',
      ],
      executeAs: 'minimal read batch, macro shape selection, dependency-cohesive extraction recipe, facade delegation-shape choice, single facade replacement, scorecard, public API audit when class is known',
    },
    atomicWriteBatchShape: [
      'atomic_create_file for extracted modules derived from macroRefactorShape.selectedDecompositionTemplate and observedSymbolClusters',
      'atomic_replace_text or atomic_edit_symbol for the facade replacement using macroRefactorShape.preferredShape plus facadeDelegationShape.preferredShape as the first measured candidate pair',
      'refactor-scorecard with derived --allow-prefix, dynamic target-dominance release, facade private-helper release, extraction-economy release, and trace-economy release immediately after the first write batch',
      args.className ? 'public-api-preservation-audit for ' + args.className : 'code_outline export comparison when no class is detected',
    ],
    batchReadJsonl: batchJsonl,
    batchReadCommand: 'printf %s ' + shellQuote(batchJsonl + '\n') + ' | node ' + shellQuote(atomicBatch) + ' -',
    scorecardCommand,
    publicApiAuditCommand,
    scopeDisciplineCommand,
    traceIsolationCommand,
    typecheckImpactCommand,
  };
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log('target_lines=' + result.currentTargetLines);
    console.log(result.batchReadCommand);
    console.log(result.scorecardCommand);
    if (result.publicApiAuditCommand) console.log(result.publicApiAuditCommand);
    console.log(result.traceIsolationCommand);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
