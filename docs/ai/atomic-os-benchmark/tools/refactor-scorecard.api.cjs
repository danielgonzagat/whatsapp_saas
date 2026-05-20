'use strict';

const path = require('node:path');
const { runGit, worktreeRel } = require('./refactor-scorecard.io.cjs');

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

module.exports = {
  isAllowedScope,
  protectedDiff,
  hasModifier,
  memberName,
  gitShowText,
  normalizeSignatureText,
  modifierText,
  parameterSignature,
  constructorSignature,
  publicMethodSignatures,
  findNamedClass,
  extractClassApi,
  diffList,
  publicApiPreservation,
};
