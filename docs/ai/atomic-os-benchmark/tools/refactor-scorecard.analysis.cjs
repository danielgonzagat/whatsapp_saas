'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { runGit, lineCount, sourceChangedFiles } = require('./refactor-scorecard.io.cjs');

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

module.exports = {
  countWord,
  facadeSurfaceMetrics,
  facadeTypeSurfaceMetrics,
  typeSpilloverEconomy,
  splitName,
  tokenRelated,
  tokenRelationScore,
  collectExportedRuntimeSymbols,
  extractPublicMethodNames,
  isSiblingRuntimeFileForReuse,
  siblingReuseCandidates,
  siblingReuseAudit,
};
