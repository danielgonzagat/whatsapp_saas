#!/usr/bin/env node
// Codemod: pair orphan <label> elements with their sibling form control.
// Targets Biome's lint/a11y/noLabelWithoutControl rule.
//
// Strategy:
//   For each <label> JSX element (JsxElement, not self-closing):
//     - Skip if already has htmlFor attribute.
//     - Skip if contains a spread attribute.
//     - Skip if wraps a form control (<input>, <select>, <textarea>) as a
//       nested descendant — that already associates the label.
//     - Otherwise, look at sibling JSX elements (within the same JsxElement
//       parent) that appear AFTER the label. If exactly one of them is an
//       intrinsic <input>/<select>/<textarea> without an existing id and
//       without a spread attribute, pair them:
//         * Generate a unique id from the label's text content + a short
//           deterministic hash of (file path, label position).
//         * Add htmlFor="<id>" to the label.
//         * Add id="<id>" to the control.
//
// Conservative: if ambiguous (multiple siblings, control already has id,
// spread attrs, non-intrinsic custom component), skip silently.

import path from 'node:path';
import crypto from 'node:crypto';
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

const FORM_CONTROLS = new Set(['input', 'select', 'textarea']);

let filesModified = 0;
let pairsCreated = 0;
const exampleIds = [];
const skipReasons = {
  labelAlreadyHasHtmlFor: 0,
  labelHasSpreadAttr: 0,
  labelWrapsControl: 0,
  labelNotJsxElement: 0,
  noParentJsxElement: 0,
  noSiblingControl: 0,
  ambiguousMultipleControls: 0,
  controlHasExistingId: 0,
  controlHasSpreadAttr: 0,
  controlNotIntrinsic: 0,
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
    if (attr.getKind() === SyntaxKind.JsxSpreadAttribute) return true;
  }
  return false;
}

function getOpeningTagName(jsxElementOrSelfClosing) {
  const kind = jsxElementOrSelfClosing.getKind();
  if (kind === SyntaxKind.JsxElement) {
    return jsxElementOrSelfClosing.getOpeningElement().getTagNameNode()?.getText() ?? null;
  }
  if (kind === SyntaxKind.JsxSelfClosingElement) {
    return jsxElementOrSelfClosing.getTagNameNode()?.getText() ?? null;
  }
  return null;
}

function getOpeningElement(jsxElementOrSelfClosing) {
  const kind = jsxElementOrSelfClosing.getKind();
  if (kind === SyntaxKind.JsxElement) {
    return jsxElementOrSelfClosing.getOpeningElement();
  }
  if (kind === SyntaxKind.JsxSelfClosingElement) {
    return jsxElementOrSelfClosing;
  }
  return null;
}

function labelWrapsFormControl(labelJsxElement) {
  // Walk all descendants looking for an intrinsic form control.
  const descendants = labelJsxElement.getDescendants();
  for (const d of descendants) {
    const k = d.getKind();
    if (k === SyntaxKind.JsxOpeningElement || k === SyntaxKind.JsxSelfClosingElement) {
      const tag = d.getTagNameNode()?.getText();
      if (tag && FORM_CONTROLS.has(tag)) return true;
    }
  }
  return false;
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

function extractLabelText(labelJsxElement) {
  // Grab only literal JsxText children (not expressions) to build a slug.
  const children = labelJsxElement.getJsxChildren();
  const parts = [];
  for (const child of children) {
    if (child.getKind() === SyntaxKind.JsxText) {
      const t = child.getText().trim();
      if (t) parts.push(t);
    }
  }
  return parts.join(' ');
}

function shortHash(input) {
  return crypto.createHash('sha1').update(input).digest('hex').slice(0, 6);
}

for (const sourceFile of sourceFiles) {
  let changed = 0;
  const filePath = sourceFile.getFilePath();

  // Iterate JsxElements whose opening tag is <label>.
  const jsxElements = sourceFile.getDescendantsOfKind(SyntaxKind.JsxElement);

  for (const labelEl of jsxElements) {
    const opening = labelEl.getOpeningElement();
    const tagName = opening.getTagNameNode()?.getText();
    if (tagName !== 'label') continue;

    if (hasAttr(opening, 'htmlFor')) {
      skipReasons.labelAlreadyHasHtmlFor += 1;
      continue;
    }
    if (hasSpreadAttribute(opening)) {
      skipReasons.labelHasSpreadAttr += 1;
      continue;
    }
    if (labelWrapsFormControl(labelEl)) {
      skipReasons.labelWrapsControl += 1;
      continue;
    }

    // Find sibling JsxChildren within the enclosing JsxElement.
    const parent = labelEl.getParent();
    if (!parent) {
      skipReasons.noParentJsxElement += 1;
      continue;
    }
    // The parent can be a JsxElement or a JsxFragment. Both expose
    // getJsxChildren.
    const parentKind = parent.getKind();
    if (parentKind !== SyntaxKind.JsxElement && parentKind !== SyntaxKind.JsxFragment) {
      skipReasons.noParentJsxElement += 1;
      continue;
    }

    const siblings = parent.getJsxChildren();
    const labelIdx = siblings.indexOf(labelEl);
    if (labelIdx < 0) {
      skipReasons.noParentJsxElement += 1;
      continue;
    }

    // Collect candidate controls after the label (before any intervening
    // label or another JsxElement/Fragment that would restart scope).
    const controlCandidates = [];
    for (let i = labelIdx + 1; i < siblings.length; i += 1) {
      const sib = siblings[i];
      const k = sib.getKind();
      if (k === SyntaxKind.JsxText) continue;
      if (k === SyntaxKind.JsxExpression) continue;
      if (k !== SyntaxKind.JsxElement && k !== SyntaxKind.JsxSelfClosingElement) {
        continue;
      }
      const sibTag = getOpeningTagName(sib);
      if (!sibTag) continue;
      // Another label marks scope end.
      if (sibTag === 'label') break;
      if (FORM_CONTROLS.has(sibTag)) {
        controlCandidates.push(sib);
      }
    }

    if (controlCandidates.length === 0) {
      skipReasons.noSiblingControl += 1;
      continue;
    }
    if (controlCandidates.length > 1) {
      skipReasons.ambiguousMultipleControls += 1;
      continue;
    }

    const control = controlCandidates[0];
    const controlTag = getOpeningTagName(control);
    if (!controlTag || !FORM_CONTROLS.has(controlTag)) {
      skipReasons.controlNotIntrinsic += 1;
      continue;
    }
    // Only intrinsic (lowercase) — already enforced by FORM_CONTROLS.

    const controlOpening = getOpeningElement(control);
    if (!controlOpening) {
      skipReasons.controlNotIntrinsic += 1;
      continue;
    }
    if (hasSpreadAttribute(controlOpening)) {
      skipReasons.controlHasSpreadAttr += 1;
      continue;
    }
    if (hasAttr(controlOpening, 'id')) {
      skipReasons.controlHasExistingId += 1;
      continue;
    }

    // Generate the id.
    const labelText = extractLabelText(labelEl);
    const slug = slugify(labelText) || controlTag;
    const relPath = path.relative(repoRoot, filePath);
    const hash = shortHash(`${relPath}:${labelEl.getStart()}:${slug}`);
    const generatedId = `${slug}-${hash}`;

    // Apply edits.
    opening.addAttribute({
      name: 'htmlFor',
      initializer: `"${generatedId}"`,
    });
    controlOpening.addAttribute({
      name: 'id',
      initializer: `"${generatedId}"`,
    });

    pairsCreated += 1;
    changed += 1;
    if (exampleIds.length < 8) {
      exampleIds.push(generatedId);
    }
  }

  if (changed > 0) {
    sourceFile.saveSync();
    filesModified += 1;
    const rel = path.relative(repoRoot, sourceFile.getFilePath());
    console.log(`  ${rel}: +${changed}`);
  }
}

console.log('');
console.log('=== Summary ===');
console.log(`Files modified:                         ${filesModified}`);
console.log(`Label/control pairs created:            ${pairsCreated}`);
console.log('--- Skips ---');
for (const [key, val] of Object.entries(skipReasons)) {
  console.log(`  ${key.padEnd(38)} ${val}`);
}
if (exampleIds.length > 0) {
  console.log('--- Example generated ids ---');
  for (const id of exampleIds) console.log(`  ${id}`);
}
