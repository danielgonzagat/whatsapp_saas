#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');

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

function runGit(worktree, args) {
  const result = spawnSync('git', ['-C', worktree, ...args], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error('git ' + args.join(' ') + ' failed: ' + (result.stderr || result.stdout));
  }
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function findUp(start, fileName) {
  let dir = path.resolve(start);
  if (fs.existsSync(dir) && fs.statSync(dir).isFile()) dir = path.dirname(dir);
  for (;;) {
    const candidate = path.join(dir, fileName);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function loadTypeScript(worktree) {
  const packageJson =
    findUp(path.join(worktree, 'backend'), 'package.json') ||
    findUp(worktree, 'package.json') ||
    findUp(__dirname, 'package.json');
  if (!packageJson) return null;
  try {
    return createRequire(packageJson)('typescript');
  } catch {
    return null;
  }
}

function uniq(values) {
  return [...new Set(values)];
}

function relPath(worktree, value) {
  const normalized = path.isAbsolute(value) ? path.relative(worktree, value) : value;
  return normalized.split(path.sep).join('/').replace(/^\.\//, '').replace(/\/+$/, '');
}

function argsCwd() {
  return process.cwd();
}

function resolveReadablePath(cwd, worktree, value) {
  const candidates = path.isAbsolute(value)
    ? [value]
    : [path.resolve(cwd, value), path.join(worktree, value)];
  const found = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  return found || candidates[0];
}

function deriveScopePrefix(worktree, target) {
  const rel = relPath(worktree, target);
  const ext = path.posix.extname(rel);
  const withoutExt = ext ? rel.slice(0, -ext.length) : rel;
  const dir = path.posix.dirname(withoutExt);
  const base = path.posix.basename(withoutExt);
  const pivot = base.lastIndexOf('.');
  const stem = pivot > 0 ? base.slice(0, pivot) : base;
  return dir === '.' ? stem : dir + '/' + stem;
}

function loadProtectedPathspecs(worktree) {
  const governancePath = path.join(worktree, 'ops', 'protected-governance-files.json');
  if (!fs.existsSync(governancePath)) return ['.'];
  const parsed = JSON.parse(fs.readFileSync(governancePath, 'utf8'));
  const exact = Array.isArray(parsed.protectedExact) ? parsed.protectedExact : [];
  const prefixes = Array.isArray(parsed.protectedPrefixes) ? parsed.protectedPrefixes : [];
  const pathspecs = uniq([...exact, ...prefixes])
    .map((value) => relPath(worktree, value))
    .filter(Boolean);
  return pathspecs.length > 0 ? pathspecs : ['.'];
}

function lineCount(absPath) {
  const text = fs.readFileSync(absPath, 'utf8');
  if (!text) return 0;
  return text.endsWith('\n') ? text.split('\n').length - 1 : text.split('\n').length;
}

function listJsonFiles(dir) {
  try {
    return fs.readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => path.join(dir, name));
  } catch (error) {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  }
}

function readJsonFile(absPath) {
  try {
    return JSON.parse(fs.readFileSync(absPath, 'utf8'));
  } catch {
    return null;
  }
}

function worktreeRel(worktree, absPath) {
  return path.relative(worktree, absPath).split(path.sep).join('/');
}

function traceInventory(worktree) {
  const traceFiles = listJsonFiles(path.join(worktree, '.atomic', 'traces')).map((absPath) => ({
    path: worktreeRel(worktree, absPath),
    data: readJsonFile(absPath),
  }));
  const tracePathSet = new Set(traceFiles.map((trace) => trace.path));
  const macroManifests = [];
  const coveredTracePaths = new Set();
  const consolidatedProductBatchUnits = new Set();
  for (const absPath of listJsonFiles(path.join(worktree, '.atomic', 'macro-traces'))) {
    const parsed = readJsonFile(absPath);
    if (!parsed || parsed.manifestKind !== 'macro_trace_consolidation') continue;
    const childTraces = Array.isArray(parsed.childTraces) ? parsed.childTraces : [];
    for (const child of childTraces) {
      if (child && typeof child.tracePath === 'string') coveredTracePaths.add(relPath(worktree, child.tracePath));
      if (child && typeof child.file === 'string') consolidatedProductBatchUnits.add(relPath(worktree, child.file));
    }
    for (const unit of Array.isArray(parsed.productBatchUnits) ? parsed.productBatchUnits : []) {
      if (typeof unit === 'string') consolidatedProductBatchUnits.add(relPath(worktree, unit));
    }
    macroManifests.push({
      path: worktreeRel(worktree, absPath),
      childTraceCount: childTraces.length,
      productBatchUnitCount: Array.isArray(parsed.productBatchUnits) ? parsed.productBatchUnits.length : 0,
      productBatchUnits: Array.isArray(parsed.productBatchUnits) ? parsed.productBatchUnits.map((unit) => relPath(worktree, unit)).sort() : [],
      decisionAuthority: parsed.decisionAuthority || null,
    });
  }
  const macroCoveredTraceCount = [...coveredTracePaths].filter((tracePath) => tracePathSet.has(tracePath)).length;
  const rawTraceCount = traceFiles.length;
  return {
    rawTraceCount,
    traceFiles: traceFiles.map((trace) => trace.path).sort(),
    macroManifests,
    macroCoveredTraceCount,
    uncoveredTraceCount: Math.max(0, rawTraceCount - macroCoveredTraceCount),
    macroCoveragePass: rawTraceCount === 0 || (macroManifests.length > 0 && macroCoveredTraceCount === rawTraceCount),
    consolidatedProductBatchUnits: [...consolidatedProductBatchUnits].sort(),
  };
}

function changedFiles(worktree) {
  const tracked = runGit(worktree, ['diff', '--name-only', '--']);
  const untracked = runGit(worktree, ['ls-files', '--others', '--exclude-standard', '--']);
  return uniq([...tracked, ...untracked]).sort();
}

function trackedNumstat(worktree, files) {
  if (!Array.isArray(files) || files.length === 0) return [];
  const result = spawnSync('git', ['-C', worktree, 'diff', '--numstat', '--', ...files], { encoding: 'utf8' });
  if (result.status !== 0) return [];
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [added, deleted, fileName] = line.split(/\t/);
      return {
        file: fileName,
        added: Number(added) || 0,
        deleted: Number(deleted) || 0,
      };
    });
}

function sourceChangedFiles(worktree, scopePrefix) {
  return changedFiles(worktree)
    .filter((fileName) => fileName.startsWith(scopePrefix) && fileName.endsWith('.ts'))
    .sort();
}

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

function isAllowedScope(fileName, args) {
  if (args.allowFiles.includes(fileName)) return true;
  if (args.allowPrefixes.some((prefix) => fileName === prefix || fileName.startsWith(prefix))) return true;
  if (args.allowAtomicTraces && fileName.startsWith('.atomic/traces/') && fileName.endsWith('.json')) return true;
  if (args.allowAtomicTraces && fileName.startsWith('.atomic/macro-traces/') && fileName.endsWith('.json')) return true;
  return false;
}

function protectedDiff(worktree, protectedPathspecs) {
  return runGit(worktree, ['diff', '--name-only', '--', ...protectedPathspecs]);
}

function hasModifier(ts, node, kinds) {
  return (node.modifiers || []).some((modifier) => kinds.includes(modifier.kind));
}

function memberName(ts, source, member) {
  if (!member.name) return null;
  if (ts.isIdentifier(member.name) || ts.isPrivateIdentifier(member.name)) return member.name.text;
  if (ts.isStringLiteral(member.name) || ts.isNumericLiteral(member.name)) return member.name.text;
  return member.name.getText(source).replace(/^['"]|['"]$/g, '');
}

function gitShowText(worktree, spec) {
  const result = spawnSync('git', ['-C', worktree, 'show', spec], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error('git show ' + spec + ' failed: ' + (result.stderr || result.stdout));
  }
  return result.stdout;
}

function normalizeSignatureText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function modifierText(ts, node) {
  return (node.modifiers || [])
    .map((modifier) => ts.SyntaxKind[modifier.kind].replace(/Keyword$/, '').toLowerCase())
    .filter((name) => name !== 'public')
    .sort()
    .join(' ');
}

function parameterSignature(ts, source, parameter) {
  const mods = modifierText(ts, parameter);
  const name = parameter.name.getText(source);
  const optional = parameter.questionToken ? '?' : '';
  const type = parameter.type ? normalizeSignatureText(parameter.type.getText(source)) : '';
  const rest = parameter.dotDotDotToken ? '...' : '';
  return [mods, rest + name + optional, type].filter(Boolean).join(' ');
}

function constructorSignature(ts, classNode, source) {
  const ctor = classNode.members.find((member) => ts.isConstructorDeclaration(member));
  if (!ctor) return null;
  return ctor.parameters.map((parameter) => parameterSignature(ts, source, parameter));
}

function publicMethodSignatures(ts, classNode, source) {
  return classNode.members
    .filter((member) => ts.isMethodDeclaration(member))
    .filter((member) => !hasModifier(ts, member, [ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.ProtectedKeyword]))
    .map((member) => {
      const name = member.name.getText(source);
      const mods = modifierText(ts, member);
      const typeParameters = member.typeParameters
        ? '<' + member.typeParameters.map((param) => normalizeSignatureText(param.getText(source))).join(', ') + '>'
        : '';
      const parameters = member.parameters.map((parameter) => parameterSignature(ts, source, parameter)).join(', ');
      const returnType = member.type ? normalizeSignatureText(member.type.getText(source)) : '';
      return [mods, name + typeParameters + '(' + parameters + ')', returnType].filter(Boolean).join(' -> ');
    })
    .sort();
}

function findNamedClass(ts, source, className) {
  let found = null;
  function visit(node) {
    if (ts.isClassDeclaration(node) && node.name && node.name.text === className) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return found;
}

function extractClassApi(ts, text, fileName, className) {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const classNode = findNamedClass(ts, source, className);
  if (!classNode) return { classFound: false, constructor: null, publicMethods: [] };
  return {
    classFound: true,
    constructor: constructorSignature(ts, classNode, source),
    publicMethods: publicMethodSignatures(ts, classNode, source),
  };
}

function diffList(before, after) {
  const beforeSet = new Set(before || []);
  const afterSet = new Set(after || []);
  return {
    missing: [...beforeSet].filter((item) => !afterSet.has(item)).sort(),
    added: [...afterSet].filter((item) => !beforeSet.has(item)).sort(),
  };
}

function publicApiPreservation(worktree, target, className) {
  if (!className) return { available: false, reason: 'class_not_configured', debt: false, pass: true };
  const ts = loadTypeScript(worktree);
  if (!ts) return { available: false, reason: 'typescript_unavailable', debt: true, pass: false };
  const beforeText = gitShowText(worktree, 'HEAD:' + target);
  const afterText = fs.readFileSync(path.join(worktree, target), 'utf8');
  const before = extractClassApi(ts, beforeText, 'before.ts', className);
  const after = extractClassApi(ts, afterText, 'after.ts', className);
  const constructorChanged = JSON.stringify(before.constructor) !== JSON.stringify(after.constructor);
  const methodDiff = diffList(before.publicMethods, after.publicMethods);
  const debt =
    !before.classFound ||
    !after.classFound ||
    constructorChanged ||
    methodDiff.missing.length > 0 ||
    methodDiff.added.length > 0;
  return {
    available: true,
    className,
    beforeClassFound: before.classFound,
    afterClassFound: after.classFound,
    constructorChanged,
    publicMethodCountBefore: before.publicMethods.length,
    publicMethodCountAfter: after.publicMethods.length,
    missingPublicMethods: methodDiff.missing,
    addedPublicMethods: methodDiff.added,
    debt,
    pass: !debt,
  };
}

function readFastpathPolicy(policyPath) {
  if (!policyPath) return { available: false, reason: 'policy_not_configured', debt: false, pass: true };
  if (!fs.existsSync(policyPath)) {
    return { available: false, reason: 'policy_file_not_found', policyPath, debt: true, pass: false };
  }
  try {
    return { available: true, policyPath, data: JSON.parse(fs.readFileSync(policyPath, 'utf8')) };
  } catch (error) {
    return {
      available: false,
      reason: 'policy_json_invalid',
      policyPath,
      error: error instanceof Error ? error.message : String(error),
      debt: true,
      pass: false,
    };
  }
}

function fastpathMacroPolicy(policy) {
  const data = policy && policy.data ? policy.data : {};
  const macroShape = data.macroRefactorShape || {};
  const direct = data.directFirstWriteBlueprint || {};
  const plan =
    macroShape.dominantRootRetentionPlan ||
    data.dominantRootRetentionPlan ||
    direct.dominantRootRetentionPlan ||
    null;
  return {
    preferredShape: macroShape.preferredShape || data.preferredShape || direct.selectedShape || null,
    dominantRootRetentionPlan: plan,
  };
}

function firstClassNode(ts, source) {
  let found = null;
  function visit(node) {
    if (!found && ts.isClassDeclaration(node)) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return found;
}

function classMethodSurface(ts, source, className, methodName) {
  const classNode = className ? findNamedClass(ts, source, className) : firstClassNode(ts, source);
  if (!classNode) return { found: false, reason: className ? 'class_not_found' : 'class_not_detected' };
  const method = classNode.members
    .filter((member) => ts.isMethodDeclaration(member))
    .find((member) => memberName(ts, source, member) === methodName);
  if (!method) return { found: false, reason: 'method_not_found', className: classNode.name ? classNode.name.text : null, methodName };
  const startLine = source.getLineAndCharacterOfPosition(method.getStart(source)).line + 1;
  const endLine = source.getLineAndCharacterOfPosition(method.getEnd()).line + 1;
  const isPrivate = hasModifier(ts, method, [ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.ProtectedKeyword]);
  return {
    found: true,
    className: classNode.name ? classNode.name.text : null,
    methodName,
    visibility: isPrivate ? 'private_or_protected' : 'public',
    startLine,
    endLine,
    lines: endLine - startLine + 1,
  };
}

function dominantRootNameFromPlan(plan) {
  if (!plan || typeof plan !== 'object') return null;
  if (typeof plan.dominantRoot === 'string' && plan.dominantRoot) return plan.dominantRoot;
  if (typeof plan.rootMethod === 'string' && plan.rootMethod) return plan.rootMethod;
  const retained = Array.isArray(plan.retainedFacadeRootSymbols) ? plan.retainedFacadeRootSymbols : [];
  const [first] = retained.filter((entry) => entry && typeof entry.name === 'string' && entry.name);
  return first ? first.name : null;
}

function dynamicRetainedRootLineFloor(plan) {
  if (!plan || typeof plan !== 'object') return null;
  const direct = Number(plan.retainedRootLinesAfterInternalCompaction);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const retained = Number(plan.retainedRootLines);
  const compacted = Number(plan.internalCompactionLineSurface);
  if (Number.isFinite(retained) && retained > 0 && Number.isFinite(compacted) && compacted >= 0) {
    return Math.max(0, retained - compacted);
  }
  return null;
}

function fastpathPolicyAdherence(worktree, target, className, policyPath) {
  const policy = readFastpathPolicy(policyPath);
  if (!policy.available) return policy;
  const macroPolicy = fastpathMacroPolicy(policy);
  if (macroPolicy.preferredShape !== 'dominant_public_root_retention') {
    return {
      available: true,
      relevant: false,
      policyPath: policy.policyPath,
      preferredShape: macroPolicy.preferredShape,
      debt: false,
      pass: true,
      decisionAuthority: 'policy preferred shape is not dominant_public_root_retention, so no retained-root adherence check applies',
    };
  }
  const plan = macroPolicy.dominantRootRetentionPlan;
  const dominantRoot = dominantRootNameFromPlan(plan);
  const retainedRootLineFloor = dynamicRetainedRootLineFloor(plan);
  if (!dominantRoot || retainedRootLineFloor === null) {
    return {
      available: true,
      relevant: true,
      policyPath: policy.policyPath,
      preferredShape: macroPolicy.preferredShape,
      dominantRoot,
      retainedRootLineFloor,
      debt: true,
      pass: false,
      reason: 'dominant_root_policy_incomplete',
    };
  }
  const ts = loadTypeScript(worktree);
  if (!ts) return { available: false, reason: 'typescript_unavailable', policyPath: policy.policyPath, debt: true, pass: false };
  const absTarget = path.join(worktree, target);
  const text = fs.readFileSync(absTarget, 'utf8');
  const source = ts.createSourceFile(absTarget, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const targetMethod = classMethodSurface(ts, source, className, dominantRoot);
  const retainedRootPresent = targetMethod.found && targetMethod.visibility === 'public';
  const retainedRootLinePass = retainedRootPresent && targetMethod.lines >= retainedRootLineFloor;
  const debt = !retainedRootLinePass;
  return {
    available: true,
    relevant: true,
    policyPath: policy.policyPath,
    preferredShape: macroPolicy.preferredShape,
    dominantRoot,
    retainedRootLineFloor,
    targetMethod,
    retainedRootPresent,
    retainedRootLinePass,
    debt,
    pass: !debt,
    decisionAuthority: 'derived from the current fast-path policy JSON and final target AST; no fixed method name, file name, latency budget, or line threshold is embedded in the scorecard',
    interpretation: debt
      ? 'The planner selected retained dominant public root topology, but the final facade did not keep that root with the dynamically derived retained line surface.'
      : 'The final facade follows the retained dominant public root topology selected by the fast-path policy.',
  };
}

function countWord(text, word) {
  if (!word) return 0;
  let count = 0;
  let offset = 0;
  for (;;) {
    const found = text.indexOf(word, offset);
    if (found === -1) return count;
    const before = found === 0 ? '' : text[found - 1];
    const after = text[found + word.length] || '';
    if (!/[A-Za-z0-9_$]/.test(before) && !/[A-Za-z0-9_$]/.test(after)) count += 1;
    offset = found + word.length;
  }
}

function facadeSurfaceMetrics(worktree, target) {
  const ts = loadTypeScript(worktree);
  if (!ts) return { available: false, reason: 'typescript_unavailable', debt: false, pass: true };
  const absTarget = path.join(worktree, target);
  const text = fs.readFileSync(absTarget, 'utf8');
  const source = ts.createSourceFile(absTarget, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let classNode = null;
  function visit(node) {
    if (!classNode && ts.isClassDeclaration(node)) classNode = node;
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!classNode) return { available: false, reason: 'class_not_found', debt: false, pass: true };
  const classText = text.slice(classNode.getStart(source), classNode.getEnd());
  const methods = classNode.members.filter((member) => ts.isMethodDeclaration(member));
  const publicMethods = [];
  const privateMethods = [];
  for (const member of methods) {
    const name = memberName(ts, source, member);
    if (!name) continue;
    const isPrivate = hasModifier(ts, member, [ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.ProtectedKeyword]);
    const info = { name, lines: source.getLineAndCharacterOfPosition(member.getEnd()).line - source.getLineAndCharacterOfPosition(member.getStart(source)).line + 1 };
    if (isPrivate) privateMethods.push(info);
    else publicMethods.push(info);
  }
  const privateMethodUsages = privateMethods.map((method) => ({
    ...method,
    usageCount: Math.max(0, countWord(classText, method.name) - 1),
  }));
  const singleUsePrivateMethods = privateMethodUsages.filter((method) => method.usageCount <= 1);
  const singleUsePrivateMethodDebt = singleUsePrivateMethods;
  const debt = singleUsePrivateMethodDebt.length > 0;
  return {
    available: true,
    publicMethodCount: publicMethods.length,
    privateMethodCount: privateMethods.length,
    privateMethodUsages,
    singleUsePrivateMethods,
    singleUsePrivateMethodDebt,
    debt,
    pass: !debt,
  };
}

function facadeTypeSurfaceMetrics(worktree, target, sourceMetrics) {
  const ts = loadTypeScript(worktree);
  if (!ts) return { available: false, reason: 'typescript_unavailable', debt: false, pass: true };
  const absTarget = path.join(worktree, target);
  const text = fs.readFileSync(absTarget, 'utf8');
  const source = ts.createSourceFile(absTarget, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const declarations = [];
  for (const statement of source.statements) {
    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) {
      declarations.push({
        kind: ts.isInterfaceDeclaration(statement) ? 'interface' : 'type_alias',
        name: statement.name ? statement.name.text : '<anonymous>',
        lines: source.getLineAndCharacterOfPosition(statement.getEnd()).line - source.getLineAndCharacterOfPosition(statement.getStart(source)).line + 1,
      });
    }
  }
  const extractedSourceCount = sourceMetrics.filter((item) => item.file !== target).length;
  const debt = extractedSourceCount > 0 && declarations.length > 0;
  return {
    available: true,
    extractedSourceCount,
    declarationCount: declarations.length,
    declarations,
    debt,
    pass: !debt,
    interpretation: 'After a facade extraction, public DTO/type declarations should move to or be imported from the owner module. Keeping them in the facade increases trust surface and import/type pressure.',
  };
}

function typeSpilloverEconomy(worktree, target, sourceMetrics, productChurn) {
  const sourceByFile = new Map(sourceMetrics.map((metric) => [metric.file, metric]));
  const newOwnerFiles = new Set((productChurn.untracked || []).map((item) => item.file));
  const extractedSourceCount = sourceMetrics.filter((item) => item.file !== target).length;
  const typeSpilloverFiles = (productChurn.tracked || [])
    .filter((item) => item.file !== target)
    .filter((item) => item.file.endsWith('.ts'))
    .filter((item) => splitName(path.posix.basename(item.file, path.posix.extname(item.file))).includes('types'))
    .map((item) => {
      const metric = sourceByFile.get(item.file) || { lines: 0 };
      const pureAddition = item.added > 0 && item.deleted === 0;
      const inventoryDebt = extractedSourceCount > 0 && newOwnerFiles.size > 0 && pureAddition && metric.lines > item.added;
      return {
        file: item.file,
        added: item.added,
        deleted: item.deleted,
        finalInventoryLines: metric.lines,
        pureAddition,
        debt: inventoryDebt,
        reason: inventoryDebt
          ? 'existing type file was touched only by additions during extraction; its whole-file inventory exceeds the local added surface and a new owner module could hold the type instead'
          : 'type-file change did not create pure-addition spillover debt under the observed extraction topology',
      };
    });
  const debtFiles = typeSpilloverFiles.filter((item) => item.debt);
  return {
    available: true,
    extractedSourceCount,
    newOwnerFileCount: newOwnerFiles.size,
    typeSpilloverFiles,
    debtFiles,
    debt: debtFiles.length > 0,
    pass: debtFiles.length === 0,
    interpretation: 'Existing shared type files are not free during facade extraction: the scorecard inventory counts the whole changed file. Touch them only when the measured diff is not pure spillover, or when validation proves owner-local type export would be worse.',
  };
}

function splitName(name) {
  return String(name || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function tokenRelated(left, right) {
  if (!left || !right) return false;
  return left === right || left.startsWith(right) || right.startsWith(left);
}

function tokenRelationScore(leftTokens, rightTokens) {
  let score = 0;
  for (const left of leftTokens) {
    for (const right of rightTokens) {
      if (tokenRelated(left, right)) score += 1;
    }
  }
  return score;
}

function collectExportedRuntimeSymbols(ts, text, fileName) {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const symbols = [];
  function exported(node) {
    return (node.modifiers || []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
  }
  function nameOf(node) {
    if (!node) return null;
    if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text;
    return node.getText(source).replace(/^['"]|['"]$/g, '');
  }
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && exported(node)) {
      const name = nameOf(node.name);
      if (name) symbols.push(name);
    } else if (ts.isVariableStatement(node) && exported(node)) {
      for (const declaration of node.declarationList.declarations) {
        const initializer = declaration.initializer;
        if (initializer && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))) {
          const name = nameOf(declaration.name);
          if (name) symbols.push(name);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return uniq(symbols).sort();
}

function extractPublicMethodNames(ts, text, fileName, className) {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const classNode = findNamedClass(ts, source, className);
  if (!classNode) return [];
  return classNode.members
    .filter((member) => ts.isMethodDeclaration(member))
    .filter((member) => !hasModifier(ts, member, [ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.ProtectedKeyword]))
    .map((member) => memberName(ts, source, member))
    .filter(Boolean)
    .sort();
}

function isSiblingRuntimeFileForReuse(rel, scopePrefix, target, spec) {
  if (rel === target || rel === spec) return false;
  if (!rel.endsWith(path.posix.extname(target) || '.ts')) return false;
  const scopeDir = path.posix.dirname(scopePrefix);
  const scopeBase = path.posix.basename(scopePrefix);
  if (path.posix.dirname(rel) !== scopeDir) return false;
  const baseName = path.posix.basename(rel);
  if (!baseName.startsWith(scopeBase)) return false;
  if (/(^|[.-])(spec|test|d)([.-]|$)|spec-helpers/.test(baseName)) return false;
  return true;
}

function siblingReuseCandidates(worktree, target, spec, scopePrefix, className) {
  const ts = loadTypeScript(worktree);
  if (!ts) return { available: false, reason: 'typescript_unavailable', modules: [], assignments: [] };
  if (!className) return { available: false, reason: 'class_not_configured', modules: [], assignments: [] };
  let beforeTargetText;
  try {
    beforeTargetText = gitShowText(worktree, 'HEAD:' + target);
  } catch {
    return { available: false, reason: 'head_target_unavailable', modules: [], assignments: [] };
  }
  const publicMethods = extractPublicMethodNames(ts, beforeTargetText, 'before.ts', className);
  if (publicMethods.length === 0) return { available: true, reason: 'no_public_methods_detected', publicMethods, modules: [], assignments: [] };
  const targetExt = path.posix.extname(target) || '.ts';
  const scopeDir = path.posix.dirname(scopePrefix);
  const scopeBase = path.posix.basename(scopePrefix);
  const targetImportStem = './' + path.posix.basename(target, targetExt);
  const moduleFiles = runGit(worktree, ['ls-files', path.posix.join(scopeDir, scopeBase + '*' + targetExt)])
    .filter((rel) => isSiblingRuntimeFileForReuse(rel, scopePrefix, target, spec));
  const modules = moduleFiles.map((file) => {
    let text;
    try {
      text = gitShowText(worktree, 'HEAD:' + file);
    } catch {
      text = fs.existsSync(path.join(worktree, file)) ? fs.readFileSync(path.join(worktree, file), 'utf8') : '';
    }
    if (/@Controller\s*\(/.test(text) || text.includes("from '" + targetImportStem + "'") || text.includes('from "' + targetImportStem + '"')) return null;
    const exportedRuntimeSymbols = collectExportedRuntimeSymbols(ts, text, file);
    if (exportedRuntimeSymbols.length === 0) return null;
    const suffix = path.posix.basename(file, targetExt).slice(scopeBase.length);
    const moduleTokens = uniq([
      ...splitName(suffix),
      ...exportedRuntimeSymbols.flatMap((symbol) => splitName(symbol)),
    ]);
    return {
      file,
      exportedRuntimeSymbols,
      moduleTokens,
      lines: fs.existsSync(path.join(worktree, file)) ? lineCount(path.join(worktree, file)) : null,
    };
  }).filter(Boolean);
  const dominantMatches = [];
  for (const method of publicMethods) {
    const methodTokens = splitName(method);
    const ranked = modules
      .map((module) => ({ module, score: tokenRelationScore(methodTokens, module.moduleTokens) }))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score || left.module.file.localeCompare(right.module.file));
    const [best, second] = ranked;
    if (!best || (second && best.score === second.score)) continue;
    dominantMatches.push({
      symbol: method,
      existingModule: best.module.file,
      score: best.score,
      reason: 'dominant_token_match_to_existing_runtime_sibling',
    });
  }
  const scoreFloor = median(dominantMatches.map((match) => match.score));
  const assignments = scoreFloor === null
    ? []
    : dominantMatches.filter((match) => match.score >= scoreFloor);
  return {
    available: true,
    reason: modules.length > 0 ? 'existing_runtime_siblings_detected' : 'no_existing_runtime_sibling_modules',
    publicMethods,
    modules,
    assignments,
  };
}

function siblingReuseAudit(worktree, target, spec, scopePrefix, className, sourceMetrics) {
  const candidates = siblingReuseCandidates(worktree, target, spec, scopePrefix, className);
  if (!candidates.available) {
    return { ...candidates, debt: false, pass: true };
  }
  const assignedOwners = new Set(candidates.assignments.map((assignment) => assignment.existingModule));
  const assignedSymbols = new Set(candidates.assignments.map((assignment) => assignment.symbol));
  const newSourceFiles = sourceMetrics
    .map((metric) => metric.file)
    .filter((file) => file !== target)
    .filter((file) => !assignedOwners.has(file));
  const missedReuseSymbols = [];
  for (const file of newSourceFiles) {
    const text = fs.readFileSync(path.join(worktree, file), 'utf8');
    for (const assignment of candidates.assignments) {
      if (assignedSymbols.has(assignment.symbol) && countWord(text, assignment.symbol) > 0) {
        missedReuseSymbols.push({
          symbol: assignment.symbol,
          expectedOwner: assignment.existingModule,
          duplicatedIn: file,
          score: assignment.score,
          reason: assignment.reason,
        });
      }
    }
  }
  const touchedExistingOwnerModules = sourceMetrics
    .filter((metric) => assignedOwners.has(metric.file))
    .map((metric) => metric.file);
  const debt = missedReuseSymbols.length > 0;
  return {
    available: true,
    reason: candidates.reason,
    decisionAuthority: 'derived from HEAD public methods, existing sibling runtime exports, token dominance, and the actual changed source files; no fixed target file or latency budget is used',
    publicMethodCount: candidates.publicMethods ? candidates.publicMethods.length : 0,
    existingRuntimeModuleCount: candidates.modules.length,
    reuseAssignmentCount: candidates.assignments.length,
    existingRuntimeModules: candidates.modules.map((module) => ({
      file: module.file,
      lines: module.lines,
      exportedRuntimeSymbols: module.exportedRuntimeSymbols,
    })),
    reuseAssignments: candidates.assignments,
    newSourceFiles,
    touchedExistingOwnerModules,
    missedReuseSymbols,
    debt,
    pass: !debt,
  };
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
