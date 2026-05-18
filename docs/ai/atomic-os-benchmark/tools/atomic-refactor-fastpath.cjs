#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');

function usage() {
  console.error('Usage: atomic-refactor-fastpath.cjs --worktree <abs> [--target <rel>] [--spec <rel>] [--class <ClassName>] [--max-target-lines <n>] [--max-file-lines <n>] [--policy-path <json>] [--json]');
  process.exit(2);
}

function parseArgs(argv) {
  const out = {
    target: null,
    spec: null,
    className: null,
    maxTargetLines: null,
    maxFileLines: null,
    policyPath: null,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--worktree') out.worktree = argv[++index];
    else if (arg === '--target') out.target = argv[++index];
    else if (arg === '--spec') out.spec = argv[++index];
    else if (arg === '--class') out.className = argv[++index];
    else if (arg === '--max-target-lines') out.maxTargetLines = Number(argv[++index]);
    else if (arg === '--max-file-lines') out.maxFileLines = Number(argv[++index]);
    else if (arg === '--policy-path') out.policyPath = argv[++index];
    else if (arg === '--json') out.json = true;
    else usage();
  }
  if (!out.worktree || !path.isAbsolute(out.worktree)) usage();
  if (!fs.existsSync(out.worktree)) throw new Error('worktree not found: ' + out.worktree);
  out.target = out.target ? relPath(out.worktree, out.target) : inferTarget(out.worktree);
  out.spec = out.spec ? relPath(out.worktree, out.spec) : inferSpec(out.worktree, out.target);
  out.className = out.className || inferClassName(abs(out.worktree, out.target));
  if (!Number.isFinite(out.maxTargetLines)) out.maxTargetLines = null;
  if (!Number.isFinite(out.maxFileLines)) out.maxFileLines = null;
  return out;
}

function findRepoRoot(start) {
  let dir = start;
  for (;;) {
    if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'scripts', 'mcp', 'atomic-edit-mcp-launcher.sh'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('could not find atomic-edit repo root from ' + start);
    dir = parent;
  }
}

function runGit(worktree, args) {
  const result = spawnSync('git', ['-C', worktree, ...args], { encoding: 'utf8' });
  if (result.status !== 0) return [];
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

function relPath(worktree, value) {
  const normalized = path.isAbsolute(value) ? path.relative(worktree, value) : value;
  return normalized.split(path.sep).join('/').replace(/^\.\//, '').replace(/\/+$/, '');
}

function abs(worktree, rel) {
  return path.join(worktree, rel);
}

function lineCount(file) {
  const text = fs.readFileSync(file, 'utf8');
  if (!text) return 0;
  return text.endsWith('\n') ? text.split('\n').length - 1 : text.split('\n').length;
}

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

function listTrackedSources(worktree) {
  return runGit(worktree, ['ls-files', '*.ts', '*.tsx', '*.js', '*.jsx', '*.mjs', '*.cjs'])
    .filter((fileName) => !fileName.includes('/node_modules/'))
    .filter((fileName) => !/(^|\.)(spec|test|d)\.[cm]?[jt]sx?$/.test(fileName))
    .filter((fileName) => fs.existsSync(abs(worktree, fileName)));
}

function inferTarget(worktree) {
  const ranked = listTrackedSources(worktree)
    .map((fileName) => ({ file: fileName, lines: lineCount(abs(worktree, fileName)) }))
    .sort((left, right) => right.lines - left.lines || left.file.localeCompare(right.file));
  if (ranked.length === 0) throw new Error('could not infer target: no tracked source files found');
  return ranked[0].file;
}

function inferSpec(worktree, target) {
  const ext = path.posix.extname(target);
  const withoutExt = ext ? target.slice(0, -ext.length) : target;
  const candidates = [withoutExt + '.spec' + ext, withoutExt + '.test' + ext];
  return candidates.find((candidate) => fs.existsSync(abs(worktree, candidate))) || null;
}

function inferClassName(file) {
  const text = readText(file);
  const exported = text.match(/export\s+class\s+([A-Za-z_$][\w$]*)/);
  if (exported) return exported[1];
  const local = text.match(/class\s+([A-Za-z_$][\w$]*)/);
  return local ? local[1] : null;
}

function deriveScopePrefix(target) {
  const ext = path.posix.extname(target);
  const withoutExt = ext ? target.slice(0, -ext.length) : target;
  const dir = path.posix.dirname(withoutExt);
  const base = path.posix.basename(withoutExt);
  const pivot = base.lastIndexOf('.');
  const stem = pivot > 0 ? base.slice(0, pivot) : base;
  return dir === '.' ? stem : dir + '/' + stem;
}

function splitName(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function symbolInventory(text) {
  const symbols = [];
  const seen = new Set();
  const patterns = [
    /^\s{2}(?:private|protected|public)?\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/gm,
    /^\s*(?:export\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm,
    /^\s*export\s+(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/gm,
  ];
  const ignored = new Set(['constructor', 'if', 'for', 'while', 'switch', 'catch', 'function']);
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const name = match[1];
      if (ignored.has(name) || seen.has(name)) continue;
      seen.add(name);
      symbols.push(name);
    }
  }
  return symbols;
}

function lineNumberAt(text, offset) {
  return text.slice(0, offset).split('\n').length;
}

function findMatchingBrace(text, openOffset) {
  let depth = 0;
  for (let index = openOffset; index < text.length; index += 1) {
    const char = text[index];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function escapeRegExp(value) {
  return String(value).replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

function containsFunctionCall(text, name) {
  const escaped = escapeRegExp(name);
  const memberCall = new RegExp('\\bthis\\s*\\.\\s*' + escaped + '\\s*\\(');
  if (memberCall.test(text)) return true;
  const bareCall = new RegExp('(^|[^A-Za-z0-9_$\\.])' + escaped + '\\s*\\(');
  return bareCall.test(text);
}

function astSymbolSpanInventory(text, fileName, worktree) {
  const ts = loadTypeScript(worktree);
  if (!ts) return null;
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const spans = [];
  const ignored = new Set(['constructor', 'if', 'for', 'while', 'switch', 'catch', 'function']);
  const seen = new Set();

  function nameText(node) {
    if (!node) return null;
    if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) {
      return node.text;
    }
    return node.getText(source).replace(/^['"]|['"]$/g, '');
  }

  function hasAstModifier(node, kinds) {
    return (node.modifiers || []).some((modifier) => kinds.includes(modifier.kind));
  }

  function pushSpan(name, node, meta = {}) {
    if (!name || ignored.has(name)) return;
    const start = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    const end = source.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
    const key = name + ':' + start + ':' + end;
    if (seen.has(key)) return;
    seen.add(key);
    spans.push({
      name,
      startLine: start,
      endLine: end,
      lines: end - start + 1,
      fileHintToken: splitName(name)[0] || name.toLowerCase(),
      isPublicSurface: Boolean(meta.isPublicSurface),
      startOffset: node.getStart(source),
      endOffset: node.getEnd(),
      calls: [],
    });
  }

  function visit(node) {
    if (ts.isMethodDeclaration(node)) {
      const isPrivate = hasAstModifier(node, [ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.ProtectedKeyword]);
      pushSpan(nameText(node.name), node, { isPublicSurface: !isPrivate });
    } else if (ts.isFunctionDeclaration(node)) {
      const isExported = hasAstModifier(node, [ts.SyntaxKind.ExportKeyword]);
      pushSpan(nameText(node.name), node, { isPublicSurface: isExported });
    } else if (ts.isVariableDeclaration(node) && node.initializer) {
      if (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) {
        pushSpan(nameText(node.name), node, { isPublicSurface: false });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  const names = spans.map((span) => span.name);
  for (const span of spans) {
    const symbolText = text.slice(span.startOffset, span.endOffset);
    span.calls = names.filter((name) => name !== span.name && containsFunctionCall(symbolText, name));
  }
  return spans.sort((left, right) => right.lines - left.lines || left.name.localeCompare(right.name));
}

function symbolSpanInventory(text, fileName, worktree) {
  const astSpans = astSymbolSpanInventory(text, fileName, worktree);
  if (astSpans && astSpans.length > 0) return astSpans;

  const spans = [];
  const pattern = /^\s{2}(?:private|protected|public)?\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::[^{}]+)?\{/gm;
  const ignored = new Set(['constructor', 'if', 'for', 'while', 'switch', 'catch', 'function']);
  for (const match of text.matchAll(pattern)) {
    const name = match[1];
    if (ignored.has(name)) continue;
    const openOffset = match.index + match[0].lastIndexOf('{');
    const closeOffset = findMatchingBrace(text, openOffset);
    if (closeOffset === -1) continue;
    const startLine = lineNumberAt(text, match.index);
    const endLine = lineNumberAt(text, closeOffset);
    spans.push({
      name,
      startLine,
      endLine,
      lines: endLine - startLine + 1,
      fileHintToken: splitName(name)[0] || name.toLowerCase(),
    });
  }
  return spans.sort((left, right) => right.lines - left.lines || left.name.localeCompare(right.name));
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

function fallbackSymbolClusters(symbols, scopePrefix, targetExt) {
  const grouped = new Map();
  for (const symbol of symbols) {
    const tokens = splitName(symbol);
    const key = tokens[0] || 'extracted';
    const current = grouped.get(key) || [];
    current.push({ name: symbol, lines: null, calls: [], isPublicSurface: false });
    grouped.set(key, current);
  }
  return {
    clusters: [...grouped.entries()]
      .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]))
      .map(([key, members]) => ({
        cluster: key,
        root: key,
        rootLines: null,
        totalObservedLines: null,
        symbols: members.map((member) => member.name),
        memberDetails: members,
        fileHint: scopePrefix + '-' + key + (targetExt || '.ts'),
        assignmentSource: 'name-token-fallback',
      })),
    retainedFacadeSymbols: [],
  };
}

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

function slugFromCommentTitle(title, fallback) {
  const tokens = splitName(String(title || ''));
  return (tokens.length > 0 ? tokens : splitName(fallback || 'section')).join('-') || 'section';
}

function retainedRootInternalCompactionPlan(targetText, rootMember, scopePrefix, targetExt) {
  if (!targetText || !rootMember || !Number.isFinite(rootMember.startOffset) || !Number.isFinite(rootMember.endOffset)) {
    return { available: false, reason: 'retained_root_offsets_unavailable', selectedSections: [] };
  }
  const rootText = targetText.slice(rootMember.startOffset, rootMember.endOffset);
  const lines = rootText.split(/\r?\n/);
  const sectionStarts = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const comment = line.match(/^\s*\/\/\s*(\S[\s\S]*)$/);
    if (comment) {
      sectionStarts.push({ index, title: comment[1].trim() });
    }
  }
  if (sectionStarts.length < 2) {
    return { available: false, reason: 'not_enough_comment_sections_in_retained_root', selectedSections: [] };
  }
  const rootTokens = splitName(rootMember.name || 'root');
  const rootSlug = rootTokens.join('-') || 'root';
  const sections = sectionStarts.map((section, position) => {
    const next = sectionStarts[position + 1];
    const startLine = section.index + 1;
    const endLine = next ? next.index : lines.length;
    const observedLines = Math.max(0, endLine - startLine + 1);
    const sectionText = lines.slice(section.index, endLine).join('\n');
    const titleSlug = slugFromCommentTitle(section.title, rootMember.name);
    return {
      title: section.title,
      startLineWithinRoot: startLine,
      endLineWithinRoot: endLine,
      observedLines,
      titleSlug,
      suggestedExportHint: rootSlug + '-' + titleSlug,
      callHints: (rootMember.calls || []).filter((call) => new RegExp('\\b' + escapeRegExp(call) + '\\s*\\(').test(sectionText)),
    };
  }).filter((section) => section.observedLines > 0);
  const averageSectionLines = sections.length > 0
    ? sections.reduce((total, section) => total + section.observedLines, 0) / sections.length
    : 0;
  const selectedSections = sections
    .filter((section) => section.observedLines > averageSectionLines)
    .sort((left, right) => right.observedLines - left.observedLines || left.title.localeCompare(right.title));
  const selectedLineSurface = sumValues(selectedSections, (section) => section.observedLines);
  return {
    available: selectedSections.length > 0,
    reason: selectedSections.length > 0 ? 'retained_root_has_above_average_comment_sections' : 'retained_root_sections_not_above_dynamic_average',
    rootMethod: rootMember.name,
    rootLines: rootMember.lines,
    averageSectionLines: Number(averageSectionLines.toFixed(3)),
    selectedLineSurface,
    sections,
    selectedSections,
    decisionAuthority: 'derived from retained public root comment-section topology and observed section line surface; no fixed section names, line ceilings, or method names',
    action: selectedSections.length > 0
      ? 'extract above-average internal sections from the retained public root into the already-selected helper/runtime owners before comparing facade compactness'
      : 'retain root body as-is because no internal section exceeds the dynamic average surface',
  };
}

function dominantPublicRootRetentionPlan(clusters, scopePrefix, targetExt, targetText = '') {
  const candidates = (Array.isArray(clusters) ? clusters : [])
    .map((cluster) => {
      const members = Array.isArray(cluster.memberDetails) ? cluster.memberDetails : [];
      const rootMember = members.find((member) => member.name === cluster.root) || null;
      const helperMembers = members.filter((member) => member.name !== cluster.root);
      return {
        cluster,
        rootMember,
        helperMembers,
        rootLines: Number(rootMember && rootMember.lines) || Number(cluster.rootLines) || 0,
        helperLines: sumValues(helperMembers, (member) => member.lines),
      };
    })
    .filter((candidate) => candidate.rootMember && candidate.rootMember.isPublicSurface)
    .filter((candidate) => candidate.rootLines > 0)
    .sort((left, right) => right.rootLines - left.rootLines || left.cluster.root.localeCompare(right.cluster.root));
  const dominant = candidates[0] || null;
  if (!dominant) {
    return { available: false, reason: 'no_public_dominant_root', selectedDecompositionTemplate: [] };
  }
  const otherClusters = clusters.filter((cluster) => cluster !== dominant.cluster);
  const helperSymbols = dominant.helperMembers.map((member) => member.name).filter(Boolean);
  const internalCompactionPlan = retainedRootInternalCompactionPlan(targetText, dominant.rootMember, scopePrefix, targetExt);
  const internalCompactionLineSurface = internalCompactionPlan.available ? internalCompactionPlan.selectedLineSurface : 0;
  const helperObservedLines = dominant.helperLines + internalCompactionLineSurface;
  const helperFile = scopePrefix + '-' + dominant.cluster.cluster + '-helpers' + (targetExt || '.ts');
  const helperTemplate = helperSymbols.length > 0 || internalCompactionPlan.available
    ? [{
        file: helperFile,
        responsibility: 'Extract private helper/support surface and selected internal sections for retained public root ' + dominant.cluster.root + ': ' + helperSymbols.join(', '),
        observedLines: helperObservedLines,
        preserveTogether: 'These helpers and internal sections move only because their public root remains in the facade for measured inventory/churn economy.',
        splitWhen: 'Move a helper or section to another owner only when dependency evidence or validation proves that owner consumes it more directly.',
        symbols: helperSymbols,
        internalCompactionSections: internalCompactionPlan.available ? internalCompactionPlan.selectedSections : [],
        internalCompactionPlan,
      }]
    : [];
  const otherTemplates = otherClusters.map((cluster) => ({
    file: cluster.fileHint,
    responsibility: 'Extract dependency-cohesive cluster rooted at ' + cluster.root + ': ' + (cluster.symbols || []).join(', '),
    observedLines: cluster.totalObservedLines,
    symbols: cluster.symbols || [],
    preserveTogether: 'Keep these symbols together unless a validation or scorecard signal proves that one member belongs to another observed dependency root.',
    splitWhen: 'Split only along an observed dependency edge or repeated validation failure, not by a fixed file or line budget.',
  }));
  const selectedDecompositionTemplate = [...otherTemplates, ...helperTemplate];
  const retainedRootLinesAfterInternalCompaction = Math.max(0, dominant.rootLines - internalCompactionLineSurface);
  const extractedLineTotal = sumValues(otherClusters, (cluster) => cluster.totalObservedLines || cluster.rootLines || 0) + helperObservedLines;
  const extractedLargestModuleLines = maxValue(
    [
      ...otherClusters.map((cluster) => ({ lines: cluster.totalObservedLines || cluster.rootLines || 0 })),
      ...helperTemplate.map((entry) => ({ lines: entry.observedLines || 0 })),
    ],
    (entry) => entry.lines,
  );
  return {
    available: selectedDecompositionTemplate.length > 0,
    reason: selectedDecompositionTemplate.length > 0
      ? 'dominant_public_root_retained_while_private_helpers_and_other_roots_extract'
      : 'no_extractable_residual_surface_after_dominant_root_retention',
    dominantRoot: dominant.cluster.root,
    dominantCluster: dominant.cluster.cluster,
    retainedRootLines: dominant.rootLines,
    retainedRootLinesAfterInternalCompaction,
    retainedRootCalls: dominant.rootMember.calls || [],
    helperLines: dominant.helperLines,
    helperObservedLines,
    internalCompactionLineSurface,
    internalCompactionPlan,
    helperSymbols,
    helperFile: helperSymbols.length > 0 || internalCompactionPlan.available ? helperFile : null,
    extractedLineTotal,
    extractedLargestModuleLines,
    productSourceFileCount: selectedDecompositionTemplate.length,
    selectedDecompositionTemplate,
    retainedFacadeRootSymbols: [{
      name: dominant.cluster.root,
      lines: dominant.rootLines,
      calls: dominant.rootMember.calls || [],
      reason: 'dominant_public_root_retained_for_inventory_churn_economy',
      releaseEligible: false,
    }],
    decisionAuthority: 'derived from public-root line surface, helper surface, dependency clusters, and scorecard economy; no fixed root name, file name, line budget, or latency budget',
  };
}

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

function directFirstWriteBlueprint(macroRefactorShape, facadeDelegationShape, retainedFacadeSymbols, args, siblingReusePlan = null) {
  const template = macroRefactorShape.available && Array.isArray(macroRefactorShape.selectedDecompositionTemplate)
    ? macroRefactorShape.selectedDecompositionTemplate
    : [];
  const defaultWriteTargets = template.map((entry) => ({
    file: entry.file,
    symbols: entry.symbols || entry.supportSymbolsMoved || [],
    responsibility: entry.responsibility,
    observedLines: entry.observedLines,
    internalCompactionSections: entry.internalCompactionSections || [],
    internalCompactionPlan: entry.internalCompactionPlan || null,
  }));
  const marginTemplate = macroRefactorShape.available && Array.isArray(macroRefactorShape.marginAmplificationTemplate)
    ? macroRefactorShape.marginAmplificationTemplate
    : template;
  const marginWriteTargets = marginTemplate.map((entry) => ({
    file: entry.file,
    symbols: entry.symbols || entry.supportSymbolsMoved || [],
    responsibility: entry.responsibility,
    observedLines: entry.observedLines,
    internalCompactionSections: entry.internalCompactionSections || [],
    internalCompactionPlan: entry.internalCompactionPlan || null,
  }));
  const supportReleaseTemplate = macroRefactorShape.balancedSupportReleasePlan && macroRefactorShape.balancedSupportReleasePlan.available
    ? macroRefactorShape.balancedSupportReleasePlan.selectedDecompositionTemplate
    : null;
  const supportReleaseWriteTargets = Array.isArray(supportReleaseTemplate)
    ? supportReleaseTemplate.map((entry) => ({
        file: entry.file,
        symbols: entry.symbols || entry.supportSymbolsMoved || [],
        responsibility: entry.responsibility,
        observedLines: entry.observedLines,
        internalCompactionSections: entry.internalCompactionSections || [],
        internalCompactionPlan: entry.internalCompactionPlan || null,
      }))
    : null;
  const reuseActive = Boolean(siblingReusePlan && siblingReusePlan.applied && siblingReusePlan.residualWriteTargets.length > 0);
  const preferredCandidate = macroRefactorShape.available && Array.isArray(macroRefactorShape.candidates)
    ? macroRefactorShape.candidates.find((candidate) => candidate.shape === macroRefactorShape.preferredShape)
    : null;
  const clearNonTradeoffShape = Boolean(preferredCandidate && preferredCandidate.dynamicReleasePass && !(preferredCandidate.operationalTradeoff && preferredCandidate.operationalTradeoff.economyTradeoffDebt));
  const compactExecutionBrief = clearNonTradeoffShape
    ? {
        mode: 'clear_non_tradeoff_shape_brief',
        decisionAuthority: 'derived from macroRefactorShape preferred candidate with dynamic release pass and no operational economy tradeoff debt',
        selectedShape: macroRefactorShape.preferredShape,
        writeTargets: reuseActive ? siblingReusePlan.residualWriteTargets : defaultWriteTargets,
        validationOrder: ['write selected modules', 'replace facade once', 'run scorecard', 'run focused Jest', 'run typecheck impact'],
        avoid: ['extra architecture exploration before first write', 'support split candidates marked as economy tradeoff debt', 'per-method writes before the batch fails validation'],
      }
    : null;
  const retainedRootSymbols = Array.isArray(macroRefactorShape.retainedFacadeRootSymbols)
    ? macroRefactorShape.retainedFacadeRootSymbols
    : [];
  const allRetainedFacadeSymbols = [...retainedFacadeSymbols, ...retainedRootSymbols];
  return {
    mode: 'policy_to_first_write_batch',
    selectedShape: macroRefactorShape.preferredShape,
    compactExecutionBrief,
    marginAmplification: {
      shape: macroRefactorShape.marginAmplificationShape || macroRefactorShape.preferredShape,
      writeTargets: marginWriteTargets,
      metrics: macroRefactorShape.marginAmplificationMetrics || null,
      useWhen: 'Use this measured shape when the loop objective is larger structural margin and the standard scorecard stays green.',
    },
    balancedSupportRelease: macroRefactorShape.balancedSupportReleasePlan && macroRefactorShape.balancedSupportReleasePlan.available
      ? {
          shape: macroRefactorShape.balancedSupportReleasePlan.shape,
          writeTargets: supportReleaseWriteTargets,
          metrics: macroRefactorShape.balancedSupportReleasePlan.metrics,
          decisionAuthority: macroRefactorShape.balancedSupportReleasePlan.decisionAuthority,
          useWhen: macroRefactorShape.balancedSupportReleasePlan.useWhen,
        }
      : macroRefactorShape.balancedSupportReleasePlan,
    delegationShape: facadeDelegationShape.available ? facadeDelegationShape.preferredShape : null,
    retainInFacade: allRetainedFacadeSymbols.map((symbol) => symbol.name),
    retainedFacadeSymbols: allRetainedFacadeSymbols.map((symbol) => ({
      name: symbol.name,
      lines: symbol.lines,
      calls: symbol.calls || [],
      reason: symbol.reason,
      releaseEligible: symbol.releaseEligible !== false,
    })),
    writeTargets: reuseActive ? siblingReusePlan.residualWriteTargets : defaultWriteTargets,
    dominantRootRetentionPlan: macroRefactorShape.dominantRootRetentionPlan || null,
    reuseExistingModules: reuseActive ? siblingReusePlan.existingModules : [],
    siblingReusePlan: reuseActive ? siblingReusePlan : null,
    preserve: {
      className: args.className,
      target: args.target,
      spec: args.spec,
      publicApi: Boolean(args.className),
    },
    firstAction: reuseActive
      ? 'reuse existing runtime sibling modules, create only the residual target module, then replace the facade from this blueprint before broader architecture exploration.'
      : 'create selected target modules and replace the facade from this blueprint before doing any broader architecture exploration.',
    proofAfterFirstBatch: ['focused spec', 'scorecard', 'public API audit', 'scope check'],
    facadeDelegationCompactness: reuseActive
      ? {
          mode: 'delegate_public_methods_by_domain_owner',
          rule: 'Each public facade method should be a one-statement delegation to the existing sibling module or residual helper selected by siblingReusePlan.',
          avoid: ['duplicated type aliases in facade', 'inline method bodies in facade', 'private facade helpers', 'per-method dependency bundle rebuilds'],
          expectedFacadeShape: 'imports, constructor, cached delegate accessors only when needed, and 24 one-statement public methods.',
        }
      : {
          mode: 'delegate_public_methods_to_selected_modules',
          rule: 'Facade keeps public signatures and delegates behavior; no retained implementation bodies unless retainedFacadeSymbols explicitly says so.',
          avoid: ['private facade helpers', 'inline implementation bodies'],
          expectedFacadeShape: 'imports, constructor, and one-statement public methods.',
        },
    traceBatching: {
      mode: 'product_batch_unit_trace',
      rule: 'Planning can be method-aware, but writing must be module/facade-batch aware. Use the fewest Atomic write units matching writeTargets plus facade replacement.',
      childEvidence: 'Per-method atomic writes are fallback only after the macro batch fails validation; otherwise they are macro-atomicity debt.',
    },
  };
}

function bestExportForSymbolName(symbolName, exportedRuntimeSymbols = []) {
  const symbolTokens = splitName(symbolName);
  const ranked = exportedRuntimeSymbols
    .filter(Boolean)
    .map((name) => ({
      name,
      score: tokenRelationScore(symbolTokens, splitName(name)),
    }))
    .sort((left, right) => right.score - left.score || left.name.length - right.name.length || left.name.localeCompare(right.name));
  const [best] = ranked;
  return best && best.score > 0 ? best : null;
}

function pascalToken(token) {
  return token ? token[0].toUpperCase() + token.slice(1) : '';
}

function ownerAliasFromFile(ownerFile, targetFile, usedAliases) {
  const ownerBase = path.posix.basename(ownerFile, path.posix.extname(ownerFile)).replace(/[.]+/g, '-');
  const targetBase = path.posix.basename(targetFile || '', path.posix.extname(targetFile || '')).replace(/[.]+/g, '-');
  const ownerTokens = splitName(ownerBase);
  const targetTokens = splitName(targetBase);
  let sharedPrefix = 0;
  while (
    sharedPrefix < ownerTokens.length &&
    sharedPrefix < targetTokens.length &&
    ownerTokens[sharedPrefix] === targetTokens[sharedPrefix]
  ) {
    sharedPrefix += 1;
  }
  const aliasTokens = ownerTokens.slice(sharedPrefix).length > 0 ? ownerTokens.slice(sharedPrefix) : ownerTokens;
  const baseAlias = aliasTokens.map(pascalToken).join('') || 'OwnerModule';
  let alias = baseAlias;
  let suffix = 2;
  while (usedAliases.has(alias)) {
    alias = baseAlias + suffix;
    suffix += 1;
  }
  usedAliases.add(alias);
  return alias;
}

function facadeImportPressurePlan(targetFile, ownerFiles, delegationOwners) {
  const usedAliases = new Set();
  const owners = ownerFiles.map((ownerFile) => {
    const ownerDelegations = delegationOwners.filter((owner) => owner.ownerFile === ownerFile);
    const preferredExports = ownerDelegations.map((owner) => owner.preferredExport).filter(Boolean);
    return {
      file: ownerFile,
      namespaceAlias: ownerAliasFromFile(ownerFile, targetFile, usedAliases),
      delegatedMethodCount: ownerDelegations.length,
      preferredExports,
    };
  });
  const namedBindingCount = owners.reduce(
    (total, owner) => total + (owner.preferredExports.length > 0 ? owner.preferredExports.length : owner.delegatedMethodCount),
    0,
  );
  const namespaceBindingCount = owners.length;
  const bindingReduction = Math.max(0, namedBindingCount - namespaceBindingCount);
  return {
    mode: bindingReduction > 0 ? 'namespace_owner_imports' : 'named_owner_imports',
    decisionAuthority: 'derived from facade owner count and delegated binding count; no fixed line budget is used',
    ownerCount: owners.length,
    namedBindingCount,
    namespaceBindingCount,
    bindingReduction,
    owners,
    rule: bindingReduction > 0
      ? 'Prefer namespace imports per owner module for runtime calls only when public signature types are imported or namespace-qualified from owner modules; never keep or recreate local facade type declarations.'
      : 'Named imports are acceptable because namespace imports do not reduce the observed binding surface.',
  };
}

function facadeDependencyBundleReusePlan(delegationOwners, facadeSurface) {
  const owners = new Map();
  for (const owner of delegationOwners) {
    if (!owner || !owner.ownerFile || owner.ownerKind === 'facade_retained') continue;
    const current = owners.get(owner.ownerFile) || {
      ownerFile: owner.ownerFile,
      methods: [],
      preferredExports: [],
    };
    current.methods.push(owner.method);
    if (owner.preferredExport) current.preferredExports.push(owner.preferredExport);
    owners.set(owner.ownerFile, current);
  }
  const dependencySurfaceCount = facadeSurface && facadeSurface.available
    ? (facadeSurface.constructorParamProperties.length + facadeSurface.privateFields.length)
    : 0;
  const dependencyNames = facadeSurface && facadeSurface.available
    ? [
        ...facadeSurface.constructorParamProperties.map((dependency) => dependency.name),
        ...facadeSurface.privateFields.map((dependency) => dependency.name),
      ].filter(Boolean)
    : [];
  const assignedAfterConstructor = new Set(
    facadeSurface && Array.isArray(facadeSurface.postConstructorAssignedFields)
      ? facadeSurface.postConstructorAssignedFields
      : [],
  );
  const mutableBundleFields = dependencyNames.filter((name) => assignedAfterConstructor.has(name));
  const sharedBundleAccessMode = {
    mode: mutableBundleFields.length === 0 ? 'direct_value_bundle' : 'accessor_bundle',
    mutableBundleFields,
    postConstructorAssignedFields: [...assignedAfterConstructor].sort(),
    decisionAuthority: 'derived from AST assignment scan over this.<field> outside the constructor; direct values are used only when the facade dependencies are not reassigned after construction',
  };
  const accessorSurfacePenalty = sharedBundleAccessMode.mode === 'accessor_bundle' ? mutableBundleFields.length : 0;
  const ownerEntries = [...owners.values()];
  const reusableOwners = ownerEntries
    .filter((owner) => owner.methods.length > 1)
    .map((owner) => ({
      ...owner,
      repeatedDelegationCount: owner.methods.length,
    }));
  const delegatedMethodCount = ownerEntries.reduce((total, owner) => total + owner.methods.length, 0);
  const repeatedMethodCount = reusableOwners.reduce((total, owner) => total + owner.methods.length, 0);
  const ownerFileCount = owners.size;
  const repeatedDirectSurface = reusableOwners.reduce(
    (total, owner) => total + (owner.methods.length * dependencySurfaceCount),
    0,
  );
  const crossOwnerDirectSurface = delegatedMethodCount * dependencySurfaceCount;
  const sameOwnerCachedSurface = dependencySurfaceCount > 0
    ? (dependencySurfaceCount * (reusableOwners.length + ownerFileCount)) + repeatedMethodCount
    : repeatedMethodCount;
  const crossOwnerSharedSurface = dependencySurfaceCount > 0
    ? dependencySurfaceCount + delegatedMethodCount + ownerFileCount + accessorSurfacePenalty
    : delegatedMethodCount + ownerFileCount + accessorSurfacePenalty;
  const sameOwnerBundlePass = reusableOwners.length > 0 && repeatedDirectSurface > sameOwnerCachedSurface;
  const crossOwnerBundlePass = reusableOwners.length === 0 && ownerFileCount > 1 && delegatedMethodCount > 1 && crossOwnerDirectSurface > crossOwnerSharedSurface;
  const cachedBundleSurface = crossOwnerBundlePass ? crossOwnerSharedSurface : sameOwnerCachedSurface;
  const economyPass = sameOwnerBundlePass || crossOwnerBundlePass;
  const reuseCandidates = reusableOwners.map((owner) => ({
    ...owner,
    action: sameOwnerBundlePass
      ? 'build one owner-local dependency bundle or cached delegate for these public methods because measured repeated direct dependency surface is larger than typed bundle surface'
      : 'keep direct per-method dependency objects because measured typed bundle/support surface is not smaller than repeated direct dependency surface',
  }));
  const sharedBundleOwners = crossOwnerBundlePass
    ? ownerEntries.map((owner) => ({
        ownerFile: owner.ownerFile,
        methods: owner.methods,
        preferredExports: owner.preferredExports,
        action: 'consume the shared facade dependency bundle instead of rebuilding the same dependency object per owner method',
      }))
    : [];
  return {
    available: economyPass,
    decisionAuthority: 'derived from owner method delegations, facade dependency surface, owner-file count, and typed bundle surface estimate across owners; no fixed facade line budget or hardcoded owner name',
    dependencyBundleEconomy: {
      dependencySurfaceCount,
      delegatedMethodCount,
      repeatedMethodCount,
      reusableOwnerCount: reusableOwners.length,
      ownerFileCount,
      repeatedDirectSurface,
      crossOwnerDirectSurface,
      sameOwnerCachedSurface,
      crossOwnerSharedSurface,
      accessorSurfacePenalty,
      sharedBundleAccessMode,
      cachedBundleSurface,
      sameOwnerBundlePass,
      crossOwnerBundlePass,
      pass: economyPass,
      interpretation: 'Bundle reuse is an economy win when measured direct dependency repetition exceeds the typed bundle/support surface, whether repetition is inside one owner or across sibling owners.',
    },
    reusableOwners: reuseCandidates,
    sharedBundleOwners,
    sharedBundleAccessMode,
    action: economyPass
      ? (crossOwnerBundlePass
          ? 'Compress repeated facade dependency objects into one shared dependency bundle consumed by sibling owners while preserving constructor shape, public method signatures, and source inventory economy.'
          : 'Compress repeated facade dependency objects per owner while preserving constructor shape, public method signatures, and source inventory economy.')
      : 'Do not materialize cached dependency bundles; direct facade delegation remains lower total inventory until measured repetition outweighs the typed bundle/support surface.',
  };
}

function firstObservableWritePlan(writeTargets) {
  const candidates = (Array.isArray(writeTargets) ? writeTargets : [])
    .map((target, index) => {
      const observedLines = Number(target && target.observedLines);
      const symbolCount = Array.isArray(target && target.symbols) ? target.symbols.length : 0;
      const measuredReleaseSurface = Number.isFinite(observedLines) && observedLines > 0 ? observedLines : symbolCount;
      return {
        file: target ? target.file : null,
        index,
        observedLines: Number.isFinite(observedLines) && observedLines > 0 ? observedLines : null,
        symbolCount,
        measuredReleaseSurface,
        responsibility: target ? target.responsibility : null,
      };
    })
    .filter((candidate) => candidate.file)
    .sort((left, right) => {
      if (left.measuredReleaseSurface !== right.measuredReleaseSurface) return right.measuredReleaseSurface - left.measuredReleaseSurface;
      if (left.symbolCount !== right.symbolCount) return right.symbolCount - left.symbolCount;
      return left.file.localeCompare(right.file);
    });
  const firstWriteTarget = candidates[0] || null;
  return {
    available: Boolean(firstWriteTarget),
    firstWriteTarget,
    orderedTargets: candidates,
    decisionAuthority: 'derived from selected writeTargets observedLines and symbol count; no fixed latency, file-name, or tool-call budget is used',
    action: firstWriteTarget
      ? 'make the first durable write against ' + firstWriteTarget.file + ' because it has the largest measured release surface among ready product batch units'
      : 'no write target available; read code_outline and recompile policy before writing',
  };
}

function retainedPublicLeafReleaseEconomyPlan(retained, ownerTarget, ownerCall, options = {}) {
  const leafLines = Number(retained && retained.lines);
  const measuredLeafLines = Number.isFinite(leafLines) && leafLines > 0 ? leafLines : null;
  const ownerObservedLines = Number(ownerTarget && ownerTarget.observedLines);
  const measuredOwnerLines = Number.isFinite(ownerObservedLines) && ownerObservedLines > 0 ? ownerObservedLines : null;
  const facadeReduction = measuredLeafLines || 0;
  const ownerLargestIncrease = measuredLeafLines || 0;
  const productSourceFileDelta = 0;
  const changedInventoryDelta = 0;
  const ownerAlreadyExists = Boolean(ownerTarget && ownerTarget.file);
  const runtimeOwnerClassPreferred = Boolean(options.runtimeOwnerClassPreferred);
  const measurable = measuredLeafLines !== null && ownerAlreadyExists;
  const standardEconomyPass = measurable && (
    productSourceFileDelta < 0 ||
    changedInventoryDelta < 0 ||
    facadeReduction > ownerLargestIncrease + Math.max(0, changedInventoryDelta)
  );
  const runtimeOwnerDelegationPass = measurable && runtimeOwnerClassPreferred && productSourceFileDelta <= 0 && changedInventoryDelta <= 0;
  const pass = standardEconomyPass || runtimeOwnerDelegationPass;
  return {
    available: measurable,
    pass,
    ownerCall,
    ownerFile: ownerTarget ? ownerTarget.file : null,
    ownerObservedLinesBefore: measuredOwnerLines,
    facadeReduction,
    ownerLargestIncrease,
    productSourceFileDelta,
    changedInventoryDelta,
    runtimeOwnerClassPreferred,
    standardEconomyPass,
    runtimeOwnerDelegationPass,
    interpretation: pass
      ? (runtimeOwnerDelegationPass
          ? 'Retained public leaf delegates through the runtime owner because runtime_owner_class_delegation is already preferred and the wrapper move does not add product source files or changed inventory.'
          : 'Retained public leaf release is active because measured economy is Pareto-improving across facade, owner pressure, source count, and inventory surfaces.')
      : 'Retained public leaf stays in the facade when release is only a surface transfer without runtime-owner delegation or a measured economy win.',
  };
}

function buildExecutableFirstBatchRecipe(blueprint, facadeSurface, siblingReusePlan = null) {
  const baseWriteTargets = Array.isArray(blueprint.writeTargets) ? blueprint.writeTargets : [];
  const writeTargets = baseWriteTargets.map((target) => ({
    ...target,
    symbols: [...new Set(target.symbols || [])],
  }));
  const retainedFacade = new Set(Array.isArray(blueprint.retainInFacade) ? blueprint.retainInFacade : []);
  const retainedDetails = Array.isArray(blueprint.retainedFacadeSymbols) ? blueprint.retainedFacadeSymbols : [];
  const reuseAssignments = siblingReusePlan && Array.isArray(siblingReusePlan.reuseAssignments)
    ? siblingReusePlan.reuseAssignments
    : [];
  const reuseBySymbol = new Map(reuseAssignments.map((assignment) => [assignment.symbol, assignment]));
  const modulesByFile = new Map(
    (Array.isArray(blueprint.reuseExistingModules) ? blueprint.reuseExistingModules : [])
      .map((module) => [module.file, module]),
  );
  const writeTargetBySymbol = new Map();
  function indexWriteTargets() {
    writeTargetBySymbol.clear();
    for (const target of writeTargets) {
      for (const symbol of target.symbols || []) {
        if (!writeTargetBySymbol.has(symbol)) writeTargetBySymbol.set(symbol, target);
      }
    }
  }
  indexWriteTargets();
  const retainedReleaseBySymbol = new Map();
  const retainedReleaseEconomyBySymbol = new Map();
  for (const retained of retainedDetails) {
    if (!retained || !retainedFacade.has(retained.name)) continue;
    if (retained.releaseEligible === false) {
      retainedReleaseEconomyBySymbol.set(retained.name, {
        available: false,
        pass: false,
        releaseEligible: false,
        interpretation: 'Dominant public root is intentionally retained in the facade because the selected macro shape optimizes inventory/churn by moving helpers and sibling roots instead of the orchestration body.',
      });
      continue;
    }
    const ownerCall = (retained.calls || []).find((call) => writeTargetBySymbol.has(call));
    if (!ownerCall) continue;
    const ownerTarget = writeTargetBySymbol.get(ownerCall);
    if (!ownerTarget) continue;
    const publicLeafReleaseEconomy = retainedPublicLeafReleaseEconomyPlan(retained, ownerTarget, ownerCall, {
      runtimeOwnerClassPreferred: blueprint.delegationShape === 'runtime_owner_class_delegation',
    });
    retainedReleaseEconomyBySymbol.set(retained.name, publicLeafReleaseEconomy);
    if (!publicLeafReleaseEconomy.pass) continue;
    if (!ownerTarget.symbols.includes(retained.name)) ownerTarget.symbols.push(retained.name);
    retainedFacade.delete(retained.name);
    retainedReleaseBySymbol.set(retained.name, {
      ownerKind: 'selected_write_target',
      ownerFile: ownerTarget.file,
      preferredExport: retained.name,
      ownerCall,
      publicLeafReleaseEconomy,
      action: publicLeafReleaseEconomy.runtimeOwnerDelegationPass
        ? 'delegate retained public leaf through its runtime owner class because runtime_owner_class_delegation is already the measured facade shape and source/inventory count do not increase'
        : 'release retained public leaf into its already-created owner module because publicLeafReleaseEconomy proves a measured economy win, not just file-count neutrality',
    });
  }
  indexWriteTargets();
  const publicMethods = facadeSurface && facadeSurface.available
    ? facadeSurface.publicMethods
    : [...new Set([...reuseBySymbol.keys(), ...writeTargetBySymbol.keys()])];
  const delegationOwners = publicMethods.map((method) => {
    const retainedRelease = retainedReleaseBySymbol.get(method);
    if (retainedRelease) {
      return {
        method,
        ...retainedRelease,
      };
    }
    if (retainedFacade.has(method)) {
      const retainedDetail = retainedDetails.find((detail) => detail && detail.name === method) || null;
      const localOwnerCall = retainedDetail && Array.isArray(retainedDetail.calls)
        ? retainedDetail.calls.find((call) => retainedFacade.has(call))
        : null;
      return {
        method,
        ownerKind: localOwnerCall ? 'facade_local_wrapper' : 'facade_retained',
        ownerCall: localOwnerCall || null,
        publicLeafReleaseEconomy: retainedReleaseEconomyBySymbol.get(method) || null,
        action: localOwnerCall
          ? 'compact this retained public leaf locally into one facade statement that calls the retained public root; do not create or grow an owner module for a wrapper-only move'
          : 'preserve public method body in facade unless publicLeafReleaseEconomy proves release is a measured economy win or runtime-owner delegation is the preferred facade shape',
      };
    }
    const reuseAssignment = reuseBySymbol.get(method);
    if (reuseAssignment) {
      const module = modulesByFile.get(reuseAssignment.existingModule) || null;
      const exportMatch = bestExportForSymbolName(method, module ? module.exportedRuntimeSymbols : []);
      return {
        method,
        ownerKind: 'existing_runtime_sibling',
        ownerFile: reuseAssignment.existingModule,
        preferredExport: exportMatch ? exportMatch.name : null,
        exportMatchScore: exportMatch ? exportMatch.score : 0,
        action: 'import the matched existing export and delegate; do not copy or rewrite the existing owner module',
      };
    }
    const writeTarget = writeTargetBySymbol.get(method) || writeTargets[0] || null;
    return {
      method,
      ownerKind: writeTarget ? 'selected_write_target' : 'unresolved',
      ownerFile: writeTarget ? writeTarget.file : null,
      preferredExport: writeTarget ? method : null,
      action: writeTarget
        ? 'move implementation to the selected write target and delegate with one public facade statement'
        : 'resolve with code_outline before writing because no owner was derived',
    };
  });
  const ownerFiles = [...new Set(delegationOwners.map((owner) => owner.ownerFile).filter(Boolean))];
  const facadeDependencyReuse = facadeDependencyBundleReusePlan(delegationOwners, facadeSurface);
  const dependencies = facadeSurface && facadeSurface.available
    ? {
        constructorParamProperties: facadeSurface.constructorParamProperties,
        privateFields: facadeSurface.privateFields,
        privateMethods: facadeSurface.privateMethods || [],
      }
    : { constructorParamProperties: [], privateFields: [], privateMethods: [] };
  const facadePressure = facadeImportPressurePlan(blueprint.preserve.target, ownerFiles, delegationOwners);
  const firstObservableWrite = firstObservableWritePlan(writeTargets);
  const firstWriteFile = firstObservableWrite.firstWriteTarget ? firstObservableWrite.firstWriteTarget.file : null;
  const orderedWriteTargets = [...writeTargets].sort((left, right) => {
    if (left.file === firstWriteFile && right.file !== firstWriteFile) return -1;
    if (right.file === firstWriteFile && left.file !== firstWriteFile) return 1;
    return 0;
  });
  return {
    mode: 'compiled_owner_map_to_first_batch',
    decisionAuthority: 'derived from detected public methods, sibling reuse assignments, selected write targets, and facade surface inventory',
    publicMethodCount: publicMethods.length,
    dependencies,
    readOnlyExistingModules: [...modulesByFile.values()].map((module) => ({
      file: module.file,
      exportedRuntimeSymbols: module.exportedRuntimeSymbols,
      reusedSymbols: module.reusedSymbols,
      action: 'read/import only unless validation proves the owner module itself is broken',
    })),
    firstObservableWritePlan: firstObservableWrite,
    writePlan: orderedWriteTargets.map((target) => ({
      file: target.file,
      symbols: target.symbols || [],
      responsibility: target.responsibility,
      observedLines: target.observedLines || null,
      internalCompactionSections: target.internalCompactionSections || [],
      internalCompactionPlan: target.internalCompactionPlan || null,
      action: firstWriteFile === target.file
        ? 'create or update this module as the first observable write before replacing the facade'
        : 'create or update this module after the first observable write and before replacing the facade',
    })),
    facadeRewritePlan: {
      target: blueprint.preserve.target,
      ownerFiles,
      methodDelegations: delegationOwners,
      importPressurePlan: facadePressure,
      dependencyBundleReusePlan: facadeDependencyReuse,
      runtimeOwnerClassPlan: {
        preferred: blueprint.delegationShape === 'runtime_owner_class_delegation',
        economy: blueprint.facadeDelegationShape && blueprint.facadeDelegationShape.runtimeOwnerClassEconomy ? blueprint.facadeDelegationShape.runtimeOwnerClassEconomy : null,
        action: blueprint.delegationShape === 'runtime_owner_class_delegation'
          ? 'materialize owner runtime classes only because dependency-surface measurement shows a strict win over direct functions while preserving constructor identity and public API'
          : 'do not materialize owner runtime classes when the dependency-surface comparison is tied or worse; prefer direct owner functions to avoid class/private-method runtime-module bloat',
      },
      dominantRootRetentionPlan: blueprint.selectedShape === 'dominant_public_root_retention'
        ? {
            active: true,
            retainedRoots: retainedDetails
              .filter((detail) => detail && detail.releaseEligible === false)
              .map((detail) => detail.name),
            internalCompactionPlan: blueprint.dominantRootRetentionPlan ? blueprint.dominantRootRetentionPlan.internalCompactionPlan : null,
            action: 'retain the dominant public orchestration root in the facade, extract its private helper surface and sibling roots, and compact wrapper leaves locally so inventory/churn do not grow just to move a body across files',
          }
        : { active: false },
      compactnessGuard: 'one public method statement per delegated method; repeated dependency objects collapse into one owner-local or cross-owner shared bundle only when dependencyBundleReusePlan.dependencyBundleEconomy.pass is true; otherwise keep direct per-method dependency objects to avoid support/type inventory bloat; no private facade helper unless this recipe leaves the method unresolved',
      postSplitFacadeCompactionPlan: {
        decisionAuthority: 'derived from methodDelegations, ownerFiles, import pressure, dependency bundle reuse, type consumers, and the next scorecard; no fixed facade line budget',
        compactionActions: [
          'after the first green scorecard, delegate every resolved public method to its owner module with one facade statement',
          'when facadeDelegationShape prefers runtime_owner_class_delegation, materialize owner runtime classes and move owner-local private helper/callback methods out of the facade before scorecard comparison',
          'when public methods repeat dependency objects within one owner or across sibling owners, build the smallest shared dependency bundle only if dependencyBundleEconomy proves lower total inventory than direct dependency objects',
          'compact retained public leaf wrappers locally when they call a retained dominant public root; this reduces facade surface without creating or growing an owner module',
          'delegate retained public leaf wrappers through their runtime owner when runtime_owner_class_delegation is preferred and the move does not increase product source count or changed inventory',
          'otherwise release retained public leaf wrappers only when publicLeafReleaseEconomy proves the move reduces at least one measured surface without worsening owner pressure or inventory',
          'keep retained public leaf bodies in the facade when release is a pure surface transfer instead of a measured Pareto improvement',
          'release facade-local types into an already-created consuming owner module before touching any existing shared type file',
          'touch an existing shared type file only when multiple owner modules consume the released type and scorecard economy stays non-worse',
          'remove facade-only private helpers when methodDelegations has no unresolved owner',
          'choose namespace or named imports from importPressurePlan instead of hand-written import style',
        ],
        typeSpilloverGuard: 'extra type-only changed files are economy debt unless scorecard typeSpilloverEconomy proves the existing shared type-file touch is cheaper than owner-local export/import; small public helper types should live in a newly-created owner module before touching an existing shared type file',
        guard: 'apply only if public API, constructor shape, scorecard, focused Jest, typecheck-impact, spec diff, protected diff, and source count remain non-worse',
      },
    },
    writeGranularityPlan: {
      planningUnit: 'public method owner map',
      writeUnit: 'product batch unit',
      productBatchUnits: [
        ...orderedWriteTargets.map((target) => ({ kind: 'module_write', file: target.file, plannedSymbols: target.symbols || [], observedLines: target.observedLines || null })),
        { kind: 'facade_replace', file: blueprint.preserve.target, plannedMethods: publicMethods },
      ],
      traceEconomy: 'Trace count should follow product batch units derived here, not methodDelegations length.',
      microWriteFallback: 'Use per-method writes only after a batch-sized write fails validation and record the failed validation reason.',
    },
    firstBatchOrder: [
      ...[...modulesByFile.values()].map((module) => ({ action: 'reuse_existing_module', file: module.file })),
      ...orderedWriteTargets.map((target) => ({ action: firstWriteFile === target.file ? 'write_first_observable_selected_module' : 'write_selected_module', file: target.file })),
      { action: 'replace_facade', file: blueprint.preserve.target },
    ],
    unresolvedPublicMethods: delegationOwners.filter((owner) => owner.ownerKind === 'unresolved').map((owner) => owner.method),
  };
}

function compactExecutionBriefWithDynamicDominance(blueprint) {
  if (!blueprint.compactExecutionBrief) return null;
  const recipe = blueprint.executableFirstBatchRecipe || null;
  const facadeRewritePlan = recipe ? recipe.facadeRewritePlan : null;
  const recipeWriteTargets = recipe
    ? recipe.writePlan.map((target) => ({
        file: target.file,
        symbols: target.symbols || [],
        responsibility: target.responsibility,
      }))
    : null;
  return {
    ...blueprint.compactExecutionBrief,
    ...(recipeWriteTargets ? { writeTargets: recipeWriteTargets } : {}),
    executableOwnerMap: recipe
      ? {
          publicMethodCount: recipe.publicMethodCount,
          readOnlyExistingModules: recipe.readOnlyExistingModules,
          firstObservableWritePlan: recipe.firstObservableWritePlan,
          writePlan: recipe.writePlan,
          facadeRewritePlan,
          firstBatchOrder: recipe.firstBatchOrder,
          unresolvedPublicMethods: recipe.unresolvedPublicMethods,
        }
      : null,
    dynamicDominanceObjective: {
      decisionAuthority: 'derived from scorecard surfaces, executable owner map, and validation results; no fixed line or time budget',
      optimizeSurfaces: [
        'target facade lines',
        'changed inventory lines',
        'largest changed source lines',
        'product churn',
        'net source deletion',
      ],
      firstObservableWritePlan: recipe ? recipe.firstObservableWritePlan : null,
      compactionRule: 'After the first green scorecard, keep only compactions that reduce at least one optimize surface without worsening any gate or increasing product source count.',
      stopRule: 'Stop when the next available product-batch compaction would require a new write target, type-only spillover file, public API change, spec/protected edit, or increased scorecard surface.',
      facadeShape: blueprint.facadeDelegationCompactness ? blueprint.facadeDelegationCompactness.expectedFacadeShape : null,
      facadeCompactnessGuard: facadeRewritePlan ? facadeRewritePlan.compactnessGuard : null,
      importPressurePlan: facadeRewritePlan ? facadeRewritePlan.importPressurePlan : null,
      dependencyBundleReusePlan: facadeRewritePlan ? facadeRewritePlan.dependencyBundleReusePlan : null,
      runtimeOwnerClassPlan: facadeRewritePlan ? facadeRewritePlan.runtimeOwnerClassPlan : null,
      balancedSupportReleasePlan: blueprint.balancedSupportRelease || null,
      postSplitFacadeCompactionPlan: facadeRewritePlan ? facadeRewritePlan.postSplitFacadeCompactionPlan : null,
      writeGranularityPlan: recipe ? recipe.writeGranularityPlan : null,
    },
  };
}

function executionStartCapsule(recipe) {
  const firstPlan = recipe && recipe.firstObservableWritePlan ? recipe.firstObservableWritePlan : null;
  const firstTarget = firstPlan && firstPlan.firstWriteTarget ? firstPlan.firstWriteTarget : null;
  if (!recipe || !firstTarget) {
    return {
      available: false,
      decisionAuthority: 'derived from executableFirstBatchRecipe availability; no fixed latency, file, or tool-call budget is used',
      action: 'compile or refresh the executable first-batch recipe before making a durable write',
    };
  }
  const productBatchUnits = recipe.writeGranularityPlan && Array.isArray(recipe.writeGranularityPlan.productBatchUnits)
    ? recipe.writeGranularityPlan.productBatchUnits
    : [];
  const firstProductBatchUnit = productBatchUnits.find((unit) => unit && unit.file === firstTarget.file) || null;
  const postFirstWriteValidations = [
    recipe.facadeRewritePlan && recipe.facadeRewritePlan.target ? 'replace facade through the compiled owner map after selected owner modules exist' : null,
    'run scorecard command generated for this worktree',
    'run focused public API audit when class surface is detected',
    'run focused Jest after the product batch exists',
  ].filter(Boolean);
  return {
    available: true,
    decisionAuthority: 'derived from firstObservableWritePlan, writeGranularityPlan, and validation surfaces in the current worktree; no fixed latency, file-name, or prompt budget is used',
    firstDurableMutation: {
      file: firstTarget.file,
      observedLines: firstTarget.observedLines,
      symbolCount: firstTarget.symbolCount,
      measuredReleaseSurface: firstTarget.measuredReleaseSurface,
      productBatchUnit: firstProductBatchUnit,
    },
    startNowWhen: [
      'target source and focused spec have been read enough to preserve public behavior',
      'the compiled first product batch unit has a non-empty owner responsibility',
      'no unresolved public method blocks the selected owner file',
      'governance and allowed-scope surfaces are already known from the compiled policy',
    ],
    deferUntilAfterFirstWrite: [
      'broad scorecard optimization',
      'facade compaction beyond one statement per resolved public method',
      'extra exploratory reads not tied to preserving the first product batch unit',
      'style-only cleanup that is not required for syntax or focused validation',
    ],
    postFirstWriteValidations,
    action: 'perform the first durable Atomic OS mutation against ' + firstTarget.file + ' as soon as the startNowWhen evidence is true, then continue the compiled product batch and validate; do not wait for a fixed clock or hardcoded command budget',
  };
}

function minimalDispatchBrief(blueprint, startCapsule, validation) {
  const recipe = blueprint.executableFirstBatchRecipe || null;
  const facadeRewritePlan = recipe ? recipe.facadeRewritePlan : null;
  const dependencyBundleReusePlan = facadeRewritePlan ? facadeRewritePlan.dependencyBundleReusePlan : null;
  const sharedBundleAccessMode = dependencyBundleReusePlan ? dependencyBundleReusePlan.sharedBundleAccessMode : null;
  return {
    decisionAuthority: 'compiled from the current executable first-batch recipe, start capsule, bundle-economy plan, and validation commands; no reusable prompt template, latency budget, file list, or command count is hardcoded',
    missionShape: blueprint.selectedShape,
    delegationShape: blueprint.delegationShape,
    firstDurableMutation: startCapsule.firstDurableMutation || null,
    startNowWhen: startCapsule.startNowWhen || [],
    deferUntilAfterFirstWrite: startCapsule.deferUntilAfterFirstWrite || [],
    firstBatchOrder: recipe && Array.isArray(recipe.firstBatchOrder) ? recipe.firstBatchOrder : [],
    productBatchUnits: recipe && recipe.writeGranularityPlan ? recipe.writeGranularityPlan.productBatchUnits : [],
    dependencyBundleAccessMode: sharedBundleAccessMode,
    facadeRewriteGuard: facadeRewritePlan ? facadeRewritePlan.compactnessGuard : null,
    validation,
    workerInstruction: [
      'Use this minimalDispatchBrief as the execution brief and the full policy JSON only as lookup evidence.',
      'Do not re-summarize the full policy before the first durable mutation when startNowWhen is already true.',
      'Make the first durable mutation against firstDurableMutation.file, continue firstBatchOrder, then run validation.',
      'Escalate back to the full policy only if the first mutation is refused, public API preservation is ambiguous, or validation fails.',
    ],
  };
}

function atomicWorkerBrief(blueprint, scorecardCommand, publicApiAuditCommand, scopeDisciplineCommand, traceIsolationCommand, typecheckImpactCommand) {
  const compactExecutionBrief = compactExecutionBriefWithDynamicDominance(blueprint);
  const startCapsule = executionStartCapsule(blueprint.executableFirstBatchRecipe);
  const validation = {
    scorecard: scorecardCommand,
    publicApiAudit: publicApiAuditCommand,
    scopeDiscipline: scopeDisciplineCommand,
    traceIsolation: traceIsolationCommand,
    typecheckImpact: typecheckImpactCommand,
  };
  return {
    execute: blueprint.firstAction,
    executionStartCapsule: startCapsule,
    minimalDispatchBrief: minimalDispatchBrief(blueprint, startCapsule, validation),
    selectedShape: blueprint.selectedShape,
    compactExecutionBrief,
    marginAmplification: blueprint.marginAmplification,
    balancedSupportRelease: blueprint.balancedSupportRelease,
    delegationShape: blueprint.delegationShape,
    retainInFacade: blueprint.retainInFacade,
    writeTargets: compactExecutionBrief && compactExecutionBrief.writeTargets ? compactExecutionBrief.writeTargets : blueprint.writeTargets,
    reuseExistingModules: blueprint.reuseExistingModules,
    siblingReusePlan: blueprint.siblingReusePlan,
    executableFirstBatchRecipe: blueprint.executableFirstBatchRecipe,
    facadeDelegationCompactness: blueprint.facadeDelegationCompactness,
    traceBatching: blueprint.traceBatching,
    preserve: blueprint.preserve,
    validation: {
      scorecard: scorecardCommand,
      publicApiAudit: publicApiAuditCommand,
      scopeDiscipline: scopeDisciplineCommand,
      traceIsolation: traceIsolationCommand,
      typecheckImpact: typecheckImpactCommand,
    },
  };
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
