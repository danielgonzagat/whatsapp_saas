#!/usr/bin/env node
// Codemod: add role="button" and tabIndex={0} to interactive non-button elements.
// Targets Biome's lint/a11y/noStaticElementInteractions rule.
//
// Strategy:
//   For each <div>, <span>, <li>, <a> (lowercase) with onClick={fn}:
//     - Add role="button" if not already present
//     - Add tabIndex={0} if not already present
//     - Skip <a> that already has href (it's already focusable via href)
//     - Skip if role is already set to something else (any value)
//     - Skip if tabIndex is already set
//     - Skip if any attribute is a JsxSpreadAttribute (consumer may set them)

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

let filesModified = 0;
const patchedByTag = { div: 0, span: 0, li: 0, a: 0 };
const skipReasons = {
  noOnClick: 0,
  hasSpread: 0,
  roleAlreadySet: 0,
  anchorHasHref: 0,
  bothAlreadyPresent: 0,
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

function hasSpreadAttr(element) {
  const attributes = element.getAttributes();
  for (const attr of attributes) {
    if (attr.getKind() === SyntaxKind.JsxSpreadAttribute) return true;
  }
  return false;
}

function getTagName(element) {
  const tagNameNode = element.getTagNameNode();
  return tagNameNode ? tagNameNode.getText() : null;
}

function processElement(element) {
  const tag = getTagName(element);
  if (!tag || !TARGET_TAGS.has(tag)) return false;

  if (!hasAttr(element, 'onClick')) {
    return false;
  }

  if (hasSpreadAttr(element)) {
    skipReasons.hasSpread += 1;
    return false;
  }

  // Skip <a> with href (already focusable)
  if (tag === 'a' && hasAttr(element, 'href')) {
    skipReasons.anchorHasHref += 1;
    return false;
  }

  const hasRole = hasAttr(element, 'role');
  const hasTabIndex = hasAttr(element, 'tabIndex');

  if (hasRole) {
    skipReasons.roleAlreadySet += 1;
    return false;
  }

  if (hasRole && hasTabIndex) {
    skipReasons.bothAlreadyPresent += 1;
    return false;
  }

  let added = false;
  if (!hasRole) {
    element.addAttribute({
      name: 'role',
      initializer: '"button"',
    });
    added = true;
  }
  if (!hasTabIndex) {
    element.addAttribute({
      name: 'tabIndex',
      initializer: '{0}',
    });
    added = true;
  }

  if (added) {
    patchedByTag[tag] += 1;
    return true;
  }
  return false;
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

const totalPatched = patchedByTag.div + patchedByTag.span + patchedByTag.li + patchedByTag.a;

console.log('');
console.log('=== Summary ===');
console.log(`Files modified:                         ${filesModified}`);
console.log(`Total elements patched:                 ${totalPatched}`);
console.log('  div    patched:                       ' + patchedByTag.div);
console.log('  span   patched:                       ' + patchedByTag.span);
console.log('  li     patched:                       ' + patchedByTag.li);
console.log('  a      patched:                       ' + patchedByTag.a);
console.log(`Skip: has JsxSpreadAttribute:           ${skipReasons.hasSpread}`);
console.log(`Skip: role already set:                 ${skipReasons.roleAlreadySet}`);
console.log('Skip: a already has href:               ' + skipReasons.anchorHasHref);
