#!/usr/bin/env node
// Codemod: add type="button" to <button> elements that Biome flags via
// lint/a11y/useButtonType.
//
// Conservative categories handled:
//   0. Buttons with an explicit onClick prop.
//   1. Buttons with no onClick BUT outside any <form> ancestor.
//   2. Buttons inside <form> whose sibling buttons already carry type="submit"
//      (the unmarked one is clearly not the submit).
//   3. Buttons inside <form> whose children or aria/data attributes clearly
//      mark them as cancel/close/back (non-submit intent).
//
// Never adds type="submit" — that is intent-bearing and needs human review.
// Skips: spread props, already-typed, capitalized <Button> components.

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
const addedByCategory = {
  onClick: 0,
  outsideForm: 0,
  siblingHasSubmit: 0,
  cancelCloseBack: 0,
};
const skipReasons = {
  notLowerCaseButton: 0,
  alreadyHasType: 0,
  hasSpread: 0,
  insideFormAmbiguous: 0,
};

const CANCEL_TEXTS = ['cancelar', 'cancel', 'fechar', 'close', 'voltar', 'back'];

function getOwningElement(attr) {
  // JsxAttribute's parent is JsxAttributes, whose parent is the opening element
  return attr.getParent()?.getParent() ?? null;
}

function getTagName(element) {
  try {
    return element.getTagNameNode().getText();
  } catch {
    return '';
  }
}

function findEnclosingFormElement(element) {
  // Walk up parents. element is JsxOpeningElement or JsxSelfClosingElement.
  // Its immediate parent in ts-morph is JsxElement (for opening) or the outer
  // JSX parent (for self-closing). We want to find an ancestor JsxElement
  // whose opening tag is "form".
  let node = element.getParent();
  while (node) {
    if (node.getKind() === SyntaxKind.JsxElement) {
      const opening = node.getOpeningElement?.();
      if (opening) {
        const name = getTagName(opening);
        if (name === 'form') {
          return node;
        }
      }
    }
    node = node.getParent();
  }
  return null;
}

function collectSiblingButtonOpenings(element) {
  // Find the parent JsxElement and collect all descendant <button> openings
  // that are "siblings" in the sense of being in the same nearest JsxElement
  // subtree root. We'll look at the direct parent JsxElement's children.
  const parent = element.getParent();
  if (!parent) return [];
  const results = [];
  // Walk all descendants of parent and collect button openings (shallow).
  const openings = parent.getDescendantsOfKind(SyntaxKind.JsxOpeningElement);
  for (const o of openings) {
    if (o === element) continue;
    if (getTagName(o) === 'button') results.push(o);
  }
  const selfClosings = parent.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement);
  for (const s of selfClosings) {
    if (s === element) continue;
    if (getTagName(s) === 'button') results.push(s);
  }
  return results;
}

function buttonHasSubmitType(element) {
  for (const attr of element.getAttributes()) {
    if (attr.getKind() !== SyntaxKind.JsxAttribute) continue;
    if (attr.getNameNode().getText() !== 'type') continue;
    const init = attr.getInitializer?.();
    if (!init) continue;
    const text = init.getText();
    if (text === '"submit"' || text === "'submit'") return true;
    // JSX expression: type={"submit"}
    if (text.includes('submit')) return true;
  }
  return false;
}

function getStringAttr(element, attrName) {
  for (const attr of element.getAttributes()) {
    if (attr.getKind() !== SyntaxKind.JsxAttribute) continue;
    if (attr.getNameNode().getText() !== attrName) continue;
    const init = attr.getInitializer?.();
    if (!init) continue;
    // StringLiteral or JsxExpression containing a string literal
    const text = init.getText();
    // strip quotes and braces/quotes
    return text
      .replace(/^\{/, '')
      .replace(/\}$/, '')
      .replace(/^["']/, '')
      .replace(/["']$/, '')
      .toLowerCase();
  }
  return null;
}

function getButtonJsxElement(element) {
  // Returns the enclosing JsxElement if element is a JsxOpeningElement.
  // For self-closing we return the self-closing itself (no children to scan).
  if (element.getKind() === SyntaxKind.JsxOpeningElement) {
    const parent = element.getParent();
    if (parent && parent.getKind() === SyntaxKind.JsxElement) return parent;
  }
  return null;
}

function buttonLooksLikeCancelClose(element) {
  // Check aria-label / data-action
  const dataAction = getStringAttr(element, 'data-action');
  if (dataAction && ['cancel', 'close'].includes(dataAction)) return true;
  const ariaLabel = getStringAttr(element, 'aria-label');
  if (ariaLabel && ['cancel', 'close'].includes(ariaLabel)) return true;

  // Self-closing buttons cannot have text children
  const jsxEl = getButtonJsxElement(element);
  if (!jsxEl) return false;

  // Gather all JsxText inside and lowercase-trim it.
  const texts = jsxEl.getDescendantsOfKind(SyntaxKind.JsxText);
  for (const t of texts) {
    const raw = t.getText().trim().toLowerCase();
    if (!raw) continue;
    for (const needle of CANCEL_TEXTS) {
      if (raw === needle) return true;
    }
  }
  // Also look at plain string literals inside expressions like {"Cancelar"}
  const strings = jsxEl.getDescendantsOfKind(SyntaxKind.StringLiteral);
  for (const s of strings) {
    const raw = s.getLiteralText().trim().toLowerCase();
    if (!raw) continue;
    for (const needle of CANCEL_TEXTS) {
      if (raw === needle) return true;
    }
  }
  const noSubstStrings = jsxEl.getDescendantsOfKind(SyntaxKind.NoSubstitutionTemplateLiteral);
  for (const s of noSubstStrings) {
    const raw = s.getLiteralText().trim().toLowerCase();
    if (!raw) continue;
    for (const needle of CANCEL_TEXTS) {
      if (raw === needle) return true;
    }
  }
  return false;
}

function processElement(element) {
  const tagNameNode = element.getTagNameNode();
  const tagName = tagNameNode.getText();

  if (tagName !== 'button') {
    return null;
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
      const name = attr.getNameNode().getText();
      if (name === 'type') {
        hasType = true;
      } else if (name === 'onClick') {
        hasOnClick = true;
      }
    }
  }

  if (hasType) {
    skipReasons.alreadyHasType += 1;
    return null;
  }
  if (hasSpread) {
    skipReasons.hasSpread += 1;
    return null;
  }

  // Decide category
  let category = null;

  if (hasOnClick) {
    category = 'onClick';
  } else {
    const formAncestor = findEnclosingFormElement(element);
    if (!formAncestor) {
      category = 'outsideForm';
    } else {
      // Inside a form. Try to prove it's safely NOT the submit.
      if (buttonLooksLikeCancelClose(element)) {
        category = 'cancelCloseBack';
      } else {
        // Look at sibling buttons within the form subtree
        const siblings = formAncestor
          .getDescendantsOfKind(SyntaxKind.JsxOpeningElement)
          .concat(formAncestor.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement))
          .filter((o) => o !== element && getTagName(o) === 'button');
        const anySubmit = siblings.some((s) => buttonHasSubmitType(s));
        if (anySubmit) {
          category = 'siblingHasSubmit';
        }
      }
    }
  }

  if (!category) {
    skipReasons.insideFormAmbiguous += 1;
    return null;
  }

  element.insertAttribute(0, {
    name: 'type',
    initializer: '"button"',
  });
  addedByCategory[category] += 1;
  return category;
}

for (const sourceFile of sourceFiles) {
  let added = 0;

  const openings = sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement);
  for (const el of openings) {
    if (processElement(el)) added += 1;
  }

  const selfClosings = sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement);
  for (const el of selfClosings) {
    if (processElement(el)) added += 1;
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
console.log(`  category onClick:           ${addedByCategory.onClick}`);
console.log(`  category outsideForm:       ${addedByCategory.outsideForm}`);
console.log(`  category siblingHasSubmit:  ${addedByCategory.siblingHasSubmit}`);
console.log(`  category cancelCloseBack:   ${addedByCategory.cancelCloseBack}`);
console.log(`Skipped (already has type):       ${skipReasons.alreadyHasType}`);
console.log(`Skipped (spread props):           ${skipReasons.hasSpread}`);
console.log(`Skipped (inside form, ambiguous): ${skipReasons.insideFormAmbiguous}`);
