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
  return element.getAttributes().some((attr) => attr.getKind() === SyntaxKind.JsxSpreadAttribute);
}

function getTagName(element) {
  const tagNameNode = element.getTagNameNode();
  return tagNameNode ? tagNameNode.getText() : null;
}

function isUnsupportedClickableTag(element, tag) {
  return !tag || !TARGET_TAGS.has(tag) || !hasAttr(element, 'onClick');
}

function classifyAttrSkip(element, tag) {
  return (
    (hasSpreadAttr(element) && 'hasSpread') ||
    (tag === 'a' && hasAttr(element, 'href') && 'anchorHasHref') ||
    (hasAttr(element, 'role') && 'roleAlreadySet') ||
    null
  );
}

function recordSkip(reason) {
  skipReasons[reason] += 1;
  return true;
}

function shouldSkipElement(element, tag) {
  if (isUnsupportedClickableTag(element, tag)) {
    return true;
  }
  const skipReason = classifyAttrSkip(element, tag);
  return skipReason ? recordSkip(skipReason) : false;
}

function applyRoleAndTabIndex(element) {
  element.addAttribute({ name: 'role', initializer: '"button"' });
  if (!hasAttr(element, 'tabIndex')) {
    element.addAttribute({ name: 'tabIndex', initializer: '{0}' });
  }
}

function processElement(element) {
  const tag = getTagName(element);
  if (shouldSkipElement(element, tag)) {
    return false;
  }
  applyRoleAndTabIndex(element);
  patchedByTag[tag] += 1;
  return true;
}

function tallyChangedElements(sourceFile, kind) {
  let count = 0;
  for (const el of sourceFile.getDescendantsOfKind(kind)) {
    if (processElement(el)) {
      count += 1;
    }
  }
  return count;
}

function processSourceFile(sourceFile) {
  const changed =
    tallyChangedElements(sourceFile, SyntaxKind.JsxOpeningElement) +
    tallyChangedElements(sourceFile, SyntaxKind.JsxSelfClosingElement);
  if (changed > 0) {
    sourceFile.saveSync();
    filesModified += 1;
    const rel = path.relative(repoRoot, sourceFile.getFilePath());
    console.log(`  ${rel}: +${changed}`);
  }
}

for (const sourceFile of sourceFiles) {
  processSourceFile(sourceFile);
}

const totalPatched = patchedByTag.div + patchedByTag.span + patchedByTag.li + patchedByTag.a;

const reportLine = (label, value) => `${label.padEnd(40, ' ')}${value}`;

console.log('');
console.log('=== Summary ===');
console.log(reportLine('Files modified:', filesModified));
console.log(reportLine('Total elements patched:', totalPatched));
console.log(reportLine('  div    patched:', patchedByTag.div));
console.log(reportLine('  span   patched:', patchedByTag.span));
console.log(reportLine('  li     patched:', patchedByTag.li));
console.log(reportLine('  a      patched:', patchedByTag.a));
console.log(reportLine('Skip: has JsxSpreadAttribute:', skipReasons.hasSpread));
console.log(reportLine('Skip: role already set:', skipReasons.roleAlreadySet));
console.log(reportLine('Skip: a already has href:', skipReasons.anchorHasHref));
