#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');

let ts;

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
  if (!packageJson) throw new Error('could not locate package.json to resolve TypeScript');
  return createRequire(packageJson)('typescript');
}

function usage() {
  console.error(
    'Usage: public-api-preservation-audit.cjs --worktree <abs> --target <path> --class <ClassName> [--json]',
  );
  process.exit(2);
}

function parseArgs(argv) {
  const out = { json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--worktree') out.worktree = argv[++index];
    else if (arg === '--target') out.target = argv[++index];
    else if (arg === '--class') out.className = argv[++index];
    else if (arg === '--json') out.json = true;
    else usage();
  }
  if (!out.worktree || !path.isAbsolute(out.worktree) || !out.target || !out.className) usage();
  return out;
}

function runGit(worktree, args) {
  const result = spawnSync('git', ['-C', worktree, ...args], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error('git ' + args.join(' ') + ' failed: ' + (result.stderr || result.stdout));
  }
  return result.stdout;
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function modifierText(node) {
  return (node.modifiers || [])
    .map((modifier) => ts.SyntaxKind[modifier.kind].replace(/Keyword$/, '').toLowerCase())
    .filter((name) => name !== 'public')
    .sort()
    .join(' ');
}

function hasModifier(node, kinds) {
  return (node.modifiers || []).some((modifier) => kinds.includes(modifier.kind));
}

function sourceFile(text, fileName) {
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function findClass(sf, className) {
  let found = null;
  function visit(node) {
    if (ts.isClassDeclaration(node) && node.name && node.name.text === className) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return found;
}

function parameterSignature(parameter, sf) {
  const mods = modifierText(parameter);
  const name = parameter.name.getText(sf);
  const optional = parameter.questionToken ? '?' : '';
  const type = parameter.type ? normalizeText(parameter.type.getText(sf)) : '';
  const rest = parameter.dotDotDotToken ? '...' : '';
  return [mods, rest + name + optional, type].filter(Boolean).join(' ');
}

function constructorSignature(classNode, sf) {
  const ctor = classNode.members.find((member) => ts.isConstructorDeclaration(member));
  if (!ctor) return null;
  return ctor.parameters.map((parameter) => parameterSignature(parameter, sf));
}

function publicMethodSignatures(classNode, sf) {
  return classNode.members
    .filter((member) => ts.isMethodDeclaration(member))
    .filter((member) => !hasModifier(member, [ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.ProtectedKeyword]))
    .map((member) => {
      const name = member.name.getText(sf);
      const mods = modifierText(member);
      const typeParameters = member.typeParameters
        ? '<' + member.typeParameters.map((param) => normalizeText(param.getText(sf))).join(', ') + '>'
        : '';
      const parameters = member.parameters.map((parameter) => parameterSignature(parameter, sf)).join(', ');
      const returnType = member.type ? normalizeText(member.type.getText(sf)) : '';
      return [mods, name + typeParameters + '(' + parameters + ')', returnType].filter(Boolean).join(' -> ');
    })
    .sort();
}

function extractApi(text, fileName, className) {
  const sf = sourceFile(text, fileName);
  const classNode = findClass(sf, className);
  if (!classNode) {
    return { classFound: false, constructor: null, publicMethods: [] };
  }
  return {
    classFound: true,
    constructor: constructorSignature(classNode, sf),
    publicMethods: publicMethodSignatures(classNode, sf),
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

function main() {
  const args = parseArgs(process.argv.slice(2));
  ts = loadTypeScript(args.worktree);
  const target = args.target.replaceAll('\\', '/').replace(/^\.\//, '');
  const beforeText = runGit(args.worktree, ['show', 'HEAD:' + target]);
  const afterPath = path.join(args.worktree, target);
  const afterText = fs.readFileSync(afterPath, 'utf8');
  const before = extractApi(beforeText, 'before.ts', args.className);
  const after = extractApi(afterText, 'after.ts', args.className);
  const constructorChanged = JSON.stringify(before.constructor) !== JSON.stringify(after.constructor);
  const methodDiff = diffList(before.publicMethods, after.publicMethods);
  const result = {
    ok:
      before.classFound &&
      after.classFound &&
      !constructorChanged &&
      methodDiff.missing.length === 0 &&
      methodDiff.added.length === 0,
    target,
    className: args.className,
    beforeClassFound: before.classFound,
    afterClassFound: after.classFound,
    constructorChanged,
    beforeConstructor: before.constructor,
    afterConstructor: after.constructor,
    publicMethodCountBefore: before.publicMethods.length,
    publicMethodCountAfter: after.publicMethods.length,
    missingPublicMethods: methodDiff.missing,
    addedPublicMethods: methodDiff.added,
  };
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log('ok=' + result.ok);
    console.log('constructor_changed=' + constructorChanged);
    console.log('missing_public_methods=' + methodDiff.missing.length);
    console.log('added_public_methods=' + methodDiff.added.length);
  }
  process.exit(result.ok ? 0 : 1);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
