#!/usr/bin/env node
// Codemod: add onKeyDown to interactive non-button elements with onClick.
// Targets Biome's lint/a11y/useKeyWithClickEvents rule.
//
// For <div>, <span>, <li>, <a> (lowercase) with onClick and no onKeyDown,
// adds onKeyDown that triggers a synthetic .click() on Enter/Space.
//
// The handler is:
//   onKeyDown={(e) => {
//     if (e.key === 'Enter' || e.key === ' ') {
//       e.preventDefault();
//       (e.currentTarget as HTMLElement).click();
//     }
//   }}
//
// This delegates to the existing onClick via the native click() method.
// e.currentTarget is always an HTMLElement at runtime for these tags.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const frontendDir = path.join(repoRoot, 'frontend');

const { Project, SyntaxKind } = await import('ts-morph');

const project = new Project({
  tsConfigFilePath: path.join(frontendDir, 'tsconfig.json'),
  skipAddingFilesFromTsConfig: true,
});

const globs = [
  path.join(frontendDir, 'src/**/*.tsx'),
  `!${path.join(frontendDir, 'src/**/*.spec.tsx')}`,
  `!${path.join(frontendDir, 'src/**/*.test.tsx')}`,
  `!${path.join(frontendDir, 'src/**/__tests__/**')}`,
];

project.addSourceFilesAtPaths(globs);

const sourceFiles = project.getSourceFiles();

const TARGET_TAGS = new Set(['div', 'span', 'li', 'a']);

// Keys that should activate a clickable element via keyboard.
const ONKEYDOWN_ATTR_BODY =
  "(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.currentTarget as HTMLElement).click(); } }";

let filesModified = 0;
const patchedByTag = { div: 0, span: 0, li: 0, a: 0 };
const skipReasons = {
  notTargetTag: 0,
  noOnClick: 0,
  alreadyHasOnKeyDown: 0,
  hasSpreadAttribute: 0,
  alreadyRemediated: 0,
};

function getAttrByName(element, name) {
  const attributes = element.getAttributes();
  for (const attr of attributes) {
    if (attr.getKind() !== SyntaxKind.JsxAttribute) continue;
    const nameNode = attr.getNameNode();
    if (nameNode && nameNode.getText() === name) {
      return attr;
    }
  }
  return null;
}

function hasAttr(element, name) {
  return getAttrByName(element, name) !== null;
}

function hasSpreadAttribute(element) {
  const attributes = element.getAttributes();
  for (const attr of attributes) {
    if (attr.getKind() === SyntaxKind.JsxSpreadAttribute) {
      return true;
    }
  }
  return false;
}

function getTagName(element) {
  const tagNameNode = element.getTagNameNode();
  return tagNameNode ? tagNameNode.getText() : null;
}

function processElement(element) {
  const tag = getTagName(element);
  if (!tag || !TARGET_TAGS.has(tag)) {
    skipReasons.notTargetTag += 1;
    return false;
  }
  if (!hasAttr(element, 'onClick')) {
    skipReasons.noOnClick += 1;
    return false;
  }
  if (hasAttr(element, 'onKeyDown')) {
    skipReasons.alreadyHasOnKeyDown += 1;
    return false;
  }
  if (hasSpreadAttribute(element)) {
    skipReasons.hasSpreadAttribute += 1;
    return false;
  }
  // Already remediated: has role="button" AND tabIndex
  if (hasAttr(element, 'role') && hasAttr(element, 'tabIndex')) {
    skipReasons.alreadyRemediated += 1;
    return false;
  }

  element.addAttribute({
    name: 'onKeyDown',
    initializer: `{${ONKEYDOWN_ATTR_BODY}}`,
  });
  patchedByTag[tag] += 1;
  return true;
}

for (const sourceFile of sourceFiles) {
  let changed = 0;

  const openings = sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement);
  for (const el of openings) {
    if (processElement(el)) changed += 1;
  }

  const selfClosings = sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement);
  for (const el of selfClosings) {
    if (processElement(el)) changed += 1;
  }

  if (changed > 0) {
    sourceFile.saveSync();
    filesModified += 1;
    const rel = path.relative(repoRoot, sourceFile.getFilePath());
    console.log(`  ${rel}: +${changed}`);
  }
}

const reportLine = (label, value) => `${label.padEnd(40, ' ')}${value}`;

console.log('');
console.log('=== Summary ===');
console.log(reportLine('Files modified:', filesModified));
console.log(reportLine('div     patched:', patchedByTag.div));
console.log(reportLine('span    patched:', patchedByTag.span));
console.log(reportLine('li      patched:', patchedByTag.li));
console.log(reportLine('a       patched:', patchedByTag.a));
console.log(
  reportLine(
    'Total patched:',
    patchedByTag.div + patchedByTag.span + patchedByTag.li + patchedByTag.a,
  ),
);
console.log(`Skip: already has onKeyDown:            ${skipReasons.alreadyHasOnKeyDown}`);
console.log(`Skip: has JSX spread attribute:         ${skipReasons.hasSpreadAttribute}`);
console.log(`Skip: already has role+tabIndex:        ${skipReasons.alreadyRemediated}`);
