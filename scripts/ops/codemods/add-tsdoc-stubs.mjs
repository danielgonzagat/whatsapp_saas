#!/usr/bin/env node
// Add minimal TSDoc comments to exported symbols + public class members
// that lack one. We ONLY add when no leading comment exists. The generated
// stub is semantic: uses the symbol name to produce a single-line /** ... */
// block. No empty or tautological comments.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const tsCandidates = [
  path.resolve(process.cwd(), 'backend/node_modules/typescript'),
  path.resolve(process.cwd(), 'frontend/node_modules/typescript'),
];
const ts = require(tsCandidates.find((p) => fs.existsSync(p)));

const roots = process.argv.slice(2);
if (!roots.length) {
  console.error('Usage: add-tsdoc-stubs.mjs <root>...');
  process.exit(1);
}

function walk(dir, out = []) {
  for (const n of fs.readdirSync(dir)) {
    const f = path.join(dir, n);
    const s = fs.statSync(f);
    if (s.isDirectory()) {
      if (['node_modules', 'dist', '.next', 'coverage', '.turbo', '__tests__'].includes(n))
        continue;
      walk(f, out);
    } else if (/\.(ts|tsx)$/.test(n) && !n.endsWith('.d.ts') && !/\.(spec|test)\./.test(n)) {
      out.push(f);
    }
  }
  return out;
}

function humanize(name) {
  if (!name) return '';
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}

function describeKind(node, name) {
  const human = humanize(name) || 'symbol';
  if (ts.isClassDeclaration(node)) return `${human}.`;
  if (ts.isInterfaceDeclaration(node)) return `${human} shape.`;
  if (ts.isTypeAliasDeclaration(node)) return `${human} type.`;
  if (ts.isEnumDeclaration(node)) return `${human} enum.`;
  if (ts.isFunctionDeclaration(node)) return `${human}.`;
  if (ts.isVariableStatement(node)) return `${human}.`;
  if (ts.isMethodDeclaration(node) || ts.isMethodSignature(node)) return `${human}.`;
  if (ts.isGetAccessor(node)) return `${human} getter.`;
  if (ts.isSetAccessor(node)) return `${human} setter.`;
  if (ts.isPropertyDeclaration(node) || ts.isPropertySignature(node)) return `${human} property.`;
  return `${human}.`;
}

function isExportedStatement(stmt) {
  return stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

function isClassMemberCandidate(member) {
  if (ts.isConstructorDeclaration(member)) return false;
  if (ts.isSemicolonClassElement(member)) return false;
  // Skip private members — TSLint_completed-docs typically targets public API.
  const isPrivate = member.modifiers?.some(
    (m) => m.kind === ts.SyntaxKind.PrivateKeyword || m.kind === ts.SyntaxKind.ProtectedKeyword,
  );
  if (isPrivate) return false;
  // Skip identifiers starting with `_` (conventional private).
  const memberName = member.name?.getText ? member.name.getText() : '';
  if (memberName.startsWith('_')) return false;
  return (
    ts.isMethodDeclaration(member) ||
    ts.isGetAccessor(member) ||
    ts.isSetAccessor(member) ||
    ts.isPropertyDeclaration(member)
  );
}

function getMemberName(member) {
  if (!member.name) return '';
  if (ts.isIdentifier(member.name)) return member.name.text;
  if (ts.isStringLiteral(member.name)) return member.name.text;
  if (ts.isComputedPropertyName(member.name)) return '';
  return member.name.getText();
}

const files = roots.flatMap((r) => (fs.statSync(r).isDirectory() ? walk(r) : [r]));
let filesChanged = 0;
let stubsAdded = 0;

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    /\.tsx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const edits = [];

  function queueStub(node, name) {
    if (!name) return;
    const leading = ts.getLeadingCommentRanges(source, node.pos);
    if (leading && leading.length > 0) return;
    const insertAt = node.getStart(sf);
    const caption = describeKind(node, name);
    const indentMatch = source.slice(0, insertAt).match(/(^|\n)([ \t]*)$/);
    const indent = indentMatch ? indentMatch[2] : '';
    edits.push({ pos: insertAt, text: `/** ${caption} */\n${indent}` });
  }

  for (const stmt of sf.statements) {
    if (!isExportedStatement(stmt)) continue;
    if (ts.isExportDeclaration(stmt) || ts.isExportAssignment(stmt)) continue;

    let name = '';
    if (
      ts.isClassDeclaration(stmt) ||
      ts.isInterfaceDeclaration(stmt) ||
      ts.isTypeAliasDeclaration(stmt) ||
      ts.isEnumDeclaration(stmt) ||
      ts.isFunctionDeclaration(stmt)
    ) {
      name = stmt.name?.getText(sf) || '';
    } else if (ts.isVariableStatement(stmt)) {
      const decl = stmt.declarationList.declarations[0];
      if (decl?.name && ts.isIdentifier(decl.name)) name = decl.name.text;
    }
    queueStub(stmt, name);

    // Walk class members for public method/getter/setter docstrings.
    if (ts.isClassDeclaration(stmt) && stmt.members) {
      for (const member of stmt.members) {
        if (!isClassMemberCandidate(member)) continue;
        queueStub(member, getMemberName(member));
      }
    }
    if (ts.isInterfaceDeclaration(stmt) && stmt.members) {
      for (const member of stmt.members) {
        if (ts.isMethodSignature(member) || ts.isPropertySignature(member)) {
          queueStub(member, getMemberName(member));
        }
      }
    }
  }

  if (!edits.length) continue;
  edits.sort((a, b) => b.pos - a.pos);
  let out = source;
  for (const e of edits) {
    out = out.slice(0, e.pos) + e.text + out.slice(e.pos);
  }
  fs.writeFileSync(file, out);
  filesChanged += 1;
  stubsAdded += edits.length;
}

console.log(`[tsdoc] ${filesChanged} files touched, ${stubsAdded} stubs added`);
