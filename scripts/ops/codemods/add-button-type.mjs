#!/usr/bin/env node
// Codemod: add type="button" to <button> elements that have onClick but no type.
// Conservative: skips spread props, custom components, buttons without onClick.

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

let filesModified = 0;
let totalAdded = 0;
const skipReasons = {
  notLowerCaseButton: 0,
  alreadyHasType: 0,
  hasSpread: 0,
  noOnClick: 0,
};

function processElement(element) {
  // element is JsxOpeningElement or JsxSelfClosingElement
  const tagNameNode = element.getTagNameNode();
  const tagName = tagNameNode.getText();

  // Only target lowercase <button>
  if (tagName !== 'button') {
    return 0;
  }

  const attributes = element.getAttributes();

  let hasType = false;
  let hasSpread = false;
  let hasOnClick = false;

  for (const attr of attributes) {
    const kind = attr.getKind();
    if (kind === SyntaxKind.JsxSpreadAttribute) {
      hasSpread = true;
      continue;
    }
    if (kind === SyntaxKind.JsxAttribute) {
      const nameNode = attr.getNameNode();
      const name = nameNode.getText();
      if (name === 'type') {
        hasType = true;
      } else if (name === 'onClick') {
        hasOnClick = true;
      }
    }
  }

  if (hasType) {
    skipReasons.alreadyHasType += 1;
    return 0;
  }
  if (hasSpread) {
    skipReasons.hasSpread += 1;
    return 0;
  }
  if (!hasOnClick) {
    skipReasons.noOnClick += 1;
    return 0;
  }

  // Insert type="button" as first attribute
  element.insertAttribute(0, {
    name: 'type',
    initializer: '"button"',
  });
  return 1;
}

for (const sourceFile of sourceFiles) {
  let added = 0;

  const openings = sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement);
  for (const el of openings) {
    added += processElement(el);
  }

  const selfClosings = sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement);
  for (const el of selfClosings) {
    added += processElement(el);
  }

  if (added > 0) {
    sourceFile.saveSync();
    filesModified += 1;
    totalAdded += added;
    const rel = path.relative(repoRoot, sourceFile.getFilePath());
    console.log(`  ${rel}: +${added}`);
  }
}

console.log('');
console.log('=== Summary ===');
console.log(`Files modified: ${filesModified}`);
console.log(`Buttons updated: ${totalAdded}`);
console.log(`Skipped (already has type): ${skipReasons.alreadyHasType}`);
console.log(`Skipped (spread props): ${skipReasons.hasSpread}`);
console.log(`Skipped (no onClick — manual review): ${skipReasons.noOnClick}`);
