#!/usr/bin/env node
// Codemod: add aria-hidden="true" to decorative SVGs.
// Targets Biome's lint/a11y/noSvgWithoutTitle rule.
//
// Two categories:
//   1. lucide-react JSX components (render as <svg> under the hood).
//   2. Inline <svg> elements without a <title> child.
//
// Skips any element where aria-hidden is already set.
// For inline <svg>, also skips elements that are semantic (aria-label,
// role="img") or that appear as the sole child of an <a>/<button> where
// the svg itself would be the accessible name (out of scope).

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
let lucidePatched = 0;
let inlineSvgPatched = 0;
const skipReasons = {
  lucideAlreadyAriaHidden: 0,
  inlineSvgAlreadyAriaHidden: 0,
  inlineSvgHasTitle: 0,
  inlineSvgHasAriaLabel: 0,
  inlineSvgHasRoleImg: 0,
  inlineSvgSoleChildOfInteractive: 0,
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

function getRoleValue(element) {
  const attr = getAttrByName(element, 'role');
  if (!attr) return null;
  const initializer = attr.getInitializer();
  if (!initializer) return null;
  // StringLiteral or JsxExpression with string literal inside
  const kind = initializer.getKind();
  if (kind === SyntaxKind.StringLiteral) {
    return initializer.getLiteralValue();
  }
  if (kind === SyntaxKind.JsxExpression) {
    const expr = initializer.getExpression();
    if (expr && expr.getKind() === SyntaxKind.StringLiteral) {
      return expr.getLiteralValue();
    }
  }
  return null;
}

function collectLucideNames(sourceFile) {
  const names = new Set();
  const imports = sourceFile.getImportDeclarations();
  for (const imp of imports) {
    const spec = imp.getModuleSpecifierValue();
    if (spec !== 'lucide-react') continue;
    const named = imp.getNamedImports();
    for (const n of named) {
      // Use the local alias (what the JSX actually references)
      const alias = n.getAliasNode();
      const ident = alias ? alias.getText() : n.getNameNode().getText();
      names.add(ident);
    }
    const defaultImport = imp.getDefaultImport();
    if (defaultImport) {
      names.add(defaultImport.getText());
    }
  }
  return names;
}

function isSvgElement(element) {
  const tagNameNode = element.getTagNameNode();
  return tagNameNode && tagNameNode.getText() === 'svg';
}

function isLucideElement(element, lucideNames) {
  const tagNameNode = element.getTagNameNode();
  if (!tagNameNode) return false;
  const name = tagNameNode.getText();
  return lucideNames.has(name);
}

function getJsxElementChildren(element) {
  // element here is JsxOpeningElement. Its parent is JsxElement which has children.
  const parent = element.getParent();
  if (!parent || parent.getKind() !== SyntaxKind.JsxElement) return [];
  return parent.getJsxChildren();
}

function svgHasTitleChild(openingElement) {
  const children = getJsxElementChildren(openingElement);
  for (const child of children) {
    const kind = child.getKind();
    if (kind === SyntaxKind.JsxElement) {
      const opening = child.getOpeningElement();
      const tag = opening.getTagNameNode()?.getText();
      if (tag === 'title') return true;
    } else if (kind === SyntaxKind.JsxSelfClosingElement) {
      const tag = child.getTagNameNode()?.getText();
      if (tag === 'title') return true;
    }
  }
  return false;
}

function isSoleMeaningfulChildOfInteractive(openingElement) {
  // openingElement belongs to a JsxElement. That JsxElement's parent may be
  // another JsxElement whose opening tag is <a> or <button>.
  const jsxElement = openingElement.getParent();
  if (!jsxElement || jsxElement.getKind() !== SyntaxKind.JsxElement) {
    // Self-closing svg has no JsxElement wrapper; treat as not-sole-child
    // unless its parent is a JsxElement.
    return false;
  }
  const parent = jsxElement.getParent();
  if (!parent || parent.getKind() !== SyntaxKind.JsxElement) return false;
  const parentOpening = parent.getOpeningElement();
  const parentTag = parentOpening.getTagNameNode()?.getText();
  if (parentTag !== 'a' && parentTag !== 'button') return false;

  // Count meaningful siblings (ignore whitespace-only JsxText)
  const siblings = parent.getJsxChildren();
  let meaningful = 0;
  for (const sib of siblings) {
    const k = sib.getKind();
    if (k === SyntaxKind.JsxText) {
      if (sib.getText().trim().length === 0) continue;
      meaningful += 1;
    } else {
      meaningful += 1;
    }
  }
  return meaningful === 1;
}

function addAriaHidden(element) {
  element.addAttribute({
    name: 'aria-hidden',
    initializer: '"true"',
  });
}

function tryPatchLucide(element, lucideNames) {
  if (lucideNames.size === 0 || !isLucideElement(element, lucideNames)) {
    return null;
  }
  if (hasAttr(element, 'aria-hidden')) {
    skipReasons.lucideAlreadyAriaHidden += 1;
    return 'skipped';
  }
  addAriaHidden(element);
  lucidePatched += 1;
  return 'patched';
}

function classifyInlineSvgAttrs(element) {
  return (
    (hasAttr(element, 'aria-hidden') && 'inlineSvgAlreadyAriaHidden') ||
    (hasAttr(element, 'aria-label') && 'inlineSvgHasAriaLabel') ||
    (getRoleValue(element) === 'img' && 'inlineSvgHasRoleImg') ||
    null
  );
}

function classifyInlineSvgChildren(element) {
  if (element.getKind() === SyntaxKind.JsxOpeningElement && svgHasTitleChild(element)) {
    return 'inlineSvgHasTitle';
  }
  if (isSoleMeaningfulChildOfInteractive(element)) {
    return 'inlineSvgSoleChildOfInteractive';
  }
  return null;
}

function classifyInlineSvgSkip(element) {
  return classifyInlineSvgAttrs(element) ?? classifyInlineSvgChildren(element);
}

function tryPatchInlineSvg(element) {
  if (!isSvgElement(element)) {
    return null;
  }
  const skipKey = classifyInlineSvgSkip(element);
  if (skipKey) {
    skipReasons[skipKey] += 1;
    return 'skipped';
  }
  addAriaHidden(element);
  inlineSvgPatched += 1;
  return 'patched';
}

function processElement(element, lucideNames) {
  const lucide = tryPatchLucide(element, lucideNames);
  if (lucide === 'patched') {
    return 1;
  }
  if (lucide === 'skipped') {
    return 0;
  }
  return tryPatchInlineSvg(element) === 'patched' ? 1 : 0;
}

function tallyChangedElements(sourceFile, kind, lucideNames) {
  let count = 0;
  for (const el of sourceFile.getDescendantsOfKind(kind)) {
    count += processElement(el, lucideNames);
  }
  return count;
}

function processSourceFile(sourceFile) {
  const lucideNames = collectLucideNames(sourceFile);
  const changed =
    tallyChangedElements(sourceFile, SyntaxKind.JsxOpeningElement, lucideNames) +
    tallyChangedElements(sourceFile, SyntaxKind.JsxSelfClosingElement, lucideNames);
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

const reportLine = (label, value) => `${label.padEnd(40, ' ')}${value}`;

console.log('');
console.log('=== Summary ===');
console.log(reportLine('Files modified:', filesModified));
console.log(reportLine('Lucide JSX elements patched:', lucidePatched));
console.log(reportLine('Inline svg elements patched:', inlineSvgPatched));
console.log(reportLine('Skip: lucide already aria-hidden:', skipReasons.lucideAlreadyAriaHidden));
console.log(
  reportLine('Skip: inline svg already aria-hidden:', skipReasons.inlineSvgAlreadyAriaHidden),
);
console.log(reportLine('Skip: inline svg has title child:', skipReasons.inlineSvgHasTitle));
console.log(reportLine('Skip: inline svg has aria-label:', skipReasons.inlineSvgHasAriaLabel));
console.log(reportLine('Skip: inline svg has role img:', skipReasons.inlineSvgHasRoleImg));
console.log(
  reportLine('Skip: inline svg sole child of a/btn:', skipReasons.inlineSvgSoleChildOfInteractive),
);
