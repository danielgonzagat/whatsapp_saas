#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const {
  runGit, findUp, loadTypeScript, uniq, relPath, argsCwd,
  resolveReadablePath, deriveScopePrefix, loadProtectedPathspecs,
  lineCount, listJsonFiles, readJsonFile, worktreeRel, traceInventory,
  changedFiles, trackedNumstat, sourceChangedFiles,
} = require('./refactor-scorecard.io.cjs');
const { median, sourceChurn, extractionEconomy, traceEconomy } = require('./refactor-scorecard.metrics.cjs');
const {
  isAllowedScope, protectedDiff, publicApiPreservation,
} = require('./refactor-scorecard.api.cjs');
const {
  readFastpathPolicy, fastpathMacroPolicy, fastpathPolicyAdherence,
} = require('./refactor-scorecard.fastpath.cjs');
const {
  facadeSurfaceMetrics, facadeTypeSurfaceMetrics,
  typeSpilloverEconomy, siblingReuseAudit,
} = require('./refactor-scorecard.analysis.cjs');

function usage() {
  console.error(
    'Usage: refactor-scorecard.cjs --worktree <abs> --target <path> [--scope-prefix <path>] [--class <ClassName> --enforce-public-api] [--max-target-lines <n>] [--max-file-lines <n>] [--spec <path>] [--enforce-scope --allow-prefix <path> ...] [--allow-file <path> ...] [--allow-atomic-traces] [--fastpath-policy <json>] [--enforce-fastpath-policy] [--enforce-target-dominance-release] [--enforce-facade-private-helper-release] [--enforce-facade-type-surface-release] [--enforce-type-spillover-economy] [--enforce-extraction-economy] [--enforce-trace-economy] [--enforce-sibling-reuse] [--json]',
  );
  process.exit(2);
}

function parseArgs(argv) {
  const out = {
    json: false,
    scopePrefix: null,
    className: null,
    enforceScope: false,
    allowPrefixes: [],
    allowFiles: [],
    allowAtomicTraces: false,
    fastpathPolicy: null,
    enforceFastpathPolicy: false,
    enforceTargetDominanceRelease: false,
    enforceFacadePrivateHelperRelease: false,
    enforceFacadeTypeSurfaceRelease: false,
    enforceTypeSpilloverEconomy: false,
    enforceExtractionEconomy: false,
    enforceTraceEconomy: false,
    enforceSiblingReuse: false,
    enforcePublicApi: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--worktree') {
      out.worktree = argv[++index];
    } else if (arg === '--target') {
      out.target = argv[++index];
    } else if (arg === '--scope-prefix') {
      out.scopePrefix = argv[++index];
    } else if (arg === '--class') {
      out.className = argv[++index];
    } else if (arg === '--max-target-lines') {
      out.maxTargetLines = Number(argv[++index]);
    } else if (arg === '--max-file-lines') {
      out.maxFileLines = Number(argv[++index]);
    } else if (arg === '--spec') {
      out.spec = argv[++index];
    } else if (arg === '--enforce-scope') {
      out.enforceScope = true;
    } else if (arg === '--allow-prefix') {
      out.allowPrefixes.push(argv[++index]);
    } else if (arg === '--allow-file') {
      out.allowFiles.push(argv[++index]);
    } else if (arg === '--allow-atomic-traces') {
      out.allowAtomicTraces = true;
    } else if (arg === '--fastpath-policy') {
      out.fastpathPolicy = argv[++index];
    } else if (arg === '--enforce-fastpath-policy') {
      out.enforceFastpathPolicy = true;
    } else if (arg === '--enforce-target-dominance-release') {
      out.enforceTargetDominanceRelease = true;
    } else if (arg === '--enforce-facade-private-helper-release') {
      out.enforceFacadePrivateHelperRelease = true;
    } else if (arg === '--enforce-facade-type-surface-release') {
      out.enforceFacadeTypeSurfaceRelease = true;
    } else if (arg === '--enforce-type-spillover-economy') {
      out.enforceTypeSpilloverEconomy = true;
    } else if (arg === '--enforce-extraction-economy') {
      out.enforceExtractionEconomy = true;
    } else if (arg === '--enforce-trace-economy') {
      out.enforceTraceEconomy = true;
    } else if (arg === '--enforce-sibling-reuse') {
      out.enforceSiblingReuse = true;
    } else if (arg === '--enforce-public-api') {
      out.enforcePublicApi = true;
    } else if (arg === '--json') {
      out.json = true;
    } else {
      usage();
    }
  }
  if (!out.worktree || !out.target) usage();
  if (out.enforcePublicApi && !out.className) throw new Error('--enforce-public-api requires --class');
  if (!path.isAbsolute(out.worktree)) throw new Error('--worktree must be absolute');
  if (!fs.existsSync(out.worktree)) throw new Error('worktree not found: ' + out.worktree);
  out.target = relPath(out.worktree, out.target);
  out.scopePrefix = out.scopePrefix
    ? relPath(out.worktree, out.scopePrefix)
    : deriveScopePrefix(out.worktree, out.target);
  out.allowPrefixes = out.allowPrefixes.map((value) => relPath(out.worktree, value));
  out.allowFiles = out.allowFiles.map((value) => relPath(out.worktree, value));
  out.fastpathPolicy = out.fastpathPolicy ? resolveReadablePath(argsCwd(), out.worktree, out.fastpathPolicy) : null;
  if (out.enforceFastpathPolicy && !out.fastpathPolicy) throw new Error('--enforce-fastpath-policy requires --fastpath-policy');
  if (out.enforceScope && out.allowPrefixes.length === 0 && out.allowFiles.length === 0 && !out.allowAtomicTraces) {
    throw new Error('--enforce-scope requires at least one allowed prefix/file or --allow-atomic-traces');
  }
  return out;
}



function main() {
  const args = parseArgs(process.argv.slice(2));
  const target = args.target;
  const allChangedFiles = changedFiles(args.worktree);
  const outOfScopeFiles = args.enforceScope
    ? allChangedFiles.filter((fileName) => !isAllowedScope(fileName, args))
    : [];
  const changedSources = sourceChangedFiles(args.worktree, args.scopePrefix);
  const sourceMetrics = changedSources.map((fileName) => ({
    file: fileName,
    lines: lineCount(path.join(args.worktree, fileName)),
  }));
  const targetLines = lineCount(path.join(args.worktree, target));
  const sortedSourceMetrics = [...sourceMetrics].sort(
    (left, right) => right.lines - left.lines || left.file.localeCompare(right.file),
  );
  const largestChangedSource = sortedSourceMetrics[0] || { file: null, lines: 0 };
  const targetSourceMetric = sourceMetrics.find((item) => item.file === target) || null;
  const largestNonTargetChangedSource = sortedSourceMetrics.find((item) => item.file !== target) || null;
  const targetDominance = {
    targetChanged: Boolean(targetSourceMetric),
    sourceCount: sourceMetrics.length,
    targetIsLargestChangedSource: largestChangedSource.file === target,
    largestNonTargetChangedSource,
    debt:
      !targetSourceMetric ||
      sourceMetrics.length <= 1 ||
      largestChangedSource.file === target,
  };
  const targetDominancePass = args.enforceTargetDominanceRelease ? !targetDominance.debt : true;
  const facadeSurface = facadeSurfaceMetrics(args.worktree, target);
  const facadeSurfacePass = args.enforceFacadePrivateHelperRelease ? facadeSurface.pass : true;
  const facadeTypeSurface = facadeTypeSurfaceMetrics(args.worktree, target, sourceMetrics);
  const facadeTypeSurfacePass = args.enforceFacadeTypeSurfaceRelease ? facadeTypeSurface.pass : true;
  const productChurn = sourceChurn(args.worktree, sourceMetrics);
  productChurn.total = productChurn.added + productChurn.deleted;
  const typeSpilloverEconomyResult = typeSpilloverEconomy(args.worktree, target, sourceMetrics, productChurn);
  const typeSpilloverEconomyPass = args.enforceTypeSpilloverEconomy ? typeSpilloverEconomyResult.pass : true;
  const extractionEconomyResult = extractionEconomy(sourceMetrics, target);
  const extractionEconomyPass = args.enforceExtractionEconomy ? extractionEconomyResult.pass : true;
  const siblingReuse = siblingReuseAudit(args.worktree, target, args.spec ? relPath(args.worktree, args.spec) : null, args.scopePrefix, args.className, sourceMetrics);
  const siblingReusePass = args.enforceSiblingReuse ? siblingReuse.pass : true;
  const fastpathPolicy = fastpathPolicyAdherence(args.worktree, target, args.className, args.fastpathPolicy);
  const fastpathPolicyPass = args.enforceFastpathPolicy ? fastpathPolicy.pass : true;
  const traceData = traceInventory(args.worktree);
  const traceEconomyResult = traceEconomy(sourceMetrics, traceData);
  const traceEconomyPass = args.enforceTraceEconomy ? traceEconomyResult.pass : true;
  const overFileLimit = Number.isFinite(args.maxFileLines)
    ? sourceMetrics.filter((item) => item.lines > args.maxFileLines)
    : [];
  const spec = args.spec ? relPath(args.worktree, args.spec) : null;
  const specDiff = spec ? runGit(args.worktree, ['diff', '--name-only', '--', spec]) : [];
  const protectedPathspecs = loadProtectedPathspecs(args.worktree);
  const protectedFiles = protectedDiff(args.worktree, protectedPathspecs);
  const publicApi = publicApiPreservation(args.worktree, target, args.className);
  const publicApiPass = args.enforcePublicApi ? publicApi.pass : true;
  const result = {
    ok: true,
    target,
    targetLines,
    maxTargetLines: Number.isFinite(args.maxTargetLines) ? args.maxTargetLines : null,
    targetLinePass: Number.isFinite(args.maxTargetLines) ? targetLines <= args.maxTargetLines : true,
    changedSourceCount: sourceMetrics.length,
    changedInventoryLines: sourceMetrics.reduce((total, item) => total + item.lines, 0),
    largestChangedSource,
    maxFileLines: Number.isFinite(args.maxFileLines) ? args.maxFileLines : null,
    overFileLimit,
    specDiff,
    protectedDiff: protectedFiles,
    protectedPathspecs,
    traceCount: traceData.rawTraceCount,
    effectiveTraceCount: traceEconomyResult.effectiveTraceCount,
    traceInventory: traceData,
    enforceTraceEconomy: args.enforceTraceEconomy,
    traceEconomy: traceEconomyResult,
    traceEconomyPass,
    enforcePublicApi: args.enforcePublicApi,
    className: args.className,
    publicApi,
    publicApiPass,
    enforceTargetDominanceRelease: args.enforceTargetDominanceRelease,
    targetDominance,
    targetDominancePass,
    enforceFacadePrivateHelperRelease: args.enforceFacadePrivateHelperRelease,
    facadeSurface,
    facadeSurfacePass,
    enforceFacadeTypeSurfaceRelease: args.enforceFacadeTypeSurfaceRelease,
    facadeTypeSurface,
    facadeTypeSurfacePass,
    enforceTypeSpilloverEconomy: args.enforceTypeSpilloverEconomy,
    typeSpilloverEconomy: typeSpilloverEconomyResult,
    typeSpilloverEconomyPass,
    enforceExtractionEconomy: args.enforceExtractionEconomy,
    productChurn,
    extractionEconomy: extractionEconomyResult,
    extractionEconomyPass,
    enforceSiblingReuse: args.enforceSiblingReuse,
    siblingReuse,
    siblingReusePass,
    enforceFastpathPolicy: args.enforceFastpathPolicy,
    fastpathPolicy,
    fastpathPolicyPass,
    enforceScope: args.enforceScope,
    allowedPrefixes: args.allowPrefixes,
    allowedFiles: args.allowFiles,
    allowAtomicTraces: args.allowAtomicTraces,
    allChangedFileCount: allChangedFiles.length,
    outOfScopeFiles,
    scopePass: outOfScopeFiles.length === 0,
  };
  result.ok =
    result.targetLinePass &&
    overFileLimit.length === 0 &&
    specDiff.length === 0 &&
    protectedFiles.length === 0 &&
    result.scopePass &&
    result.targetDominancePass &&
    result.facadeSurfacePass &&
    result.facadeTypeSurfacePass &&
    result.typeSpilloverEconomyPass &&
    result.extractionEconomyPass &&
    result.siblingReusePass &&
    result.fastpathPolicyPass &&
    result.traceEconomyPass &&
    result.publicApiPass;

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('ok=' + result.ok);
    console.log('target_lines=' + targetLines);
    console.log('changed_inventory_lines=' + result.changedInventoryLines);
    console.log('largest_changed_source=' + (largestChangedSource.file || '') + ':' + largestChangedSource.lines);
    console.log('trace_count=' + result.traceCount);
    console.log('target_dominance_pass=' + result.targetDominancePass);
    console.log('facade_surface_pass=' + result.facadeSurfacePass);
    console.log('facade_type_surface_pass=' + result.facadeTypeSurfacePass);
    console.log('type_spillover_economy_pass=' + result.typeSpilloverEconomyPass);
    console.log('extraction_economy_pass=' + result.extractionEconomyPass);
    console.log('sibling_reuse_pass=' + result.siblingReusePass);
    console.log('fastpath_policy_pass=' + result.fastpathPolicyPass);
    console.log('trace_economy_pass=' + result.traceEconomyPass);
    console.log('public_api_pass=' + result.publicApiPass);
    console.log('source_churn=' + result.productChurn.total);
    console.log('scope_pass=' + result.scopePass);
    if (outOfScopeFiles.length > 0) console.log('out_of_scope_files=' + outOfScopeFiles.join(','));
  }
  process.exit(result.ok ? 0 : 1);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
